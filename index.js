import {
    generateRaw,
    eventSource,
    event_types,
    saveSettingsDebounced,
} from "/script.js";
import {
    extension_settings,
} from "/scripts/extensions.js";
import {
    regex_placement,
} from "/scripts/extensions/regex/engine.js";
import * as tutuRegexEngine from "/scripts/extensions/regex/engine.js";
import {
    world_names,
    loadWorldInfo,
} from "/scripts/world-info.js";

import { getPresetManager } from "/scripts/preset-manager.js";





// 注：不需要引入 oai_settings 和 power_user 了，因为我们要直接读文件
jQuery(async () => {
    // ==========================================
    // 0. 数据存储管理 (LocalStorage)
    // ==========================================
async function injectTutuRegex() {
    const REGEX_SCRIPT_NAME = '🐱克制放映室过滤';
    const LEGACY_REGEX_SCRIPT_NAME = '🐰兔兔小剧场过滤';

    const tutuRegexScript = {
        /*
         * id 是 SillyTavern 正则扩展当前版本需要的字段。
         * 没有 id 时，页面渲染时虽然可能自动补，
         * 但这里直接生成最稳妥。
         */
        id:
            typeof crypto?.randomUUID === 'function'
                ? crypto.randomUUID()
                : `tutu-theater-${Date.now()}-${Math.random()
                    .toString(16)
                    .slice(2)}`,

        scriptName: REGEX_SCRIPT_NAME,

        findRegex:
            '<!--\\s*TUTU_THEATER_START\\s*-->[\\s\\S]*?<!--\\s*TUTU_THEATER_END\\s*-->',

        replaceString: '',

        trimStrings: [],

        /*
         * 1 = AI 输出。
         */
        placement: [1],

        disabled: false,

        markdownOnly: false,

        /*
         * 只处理发送给 AI 的 prompt，
         * 不修改聊天界面的显示。
         */
        promptOnly: true,

        runOnEdit: true,

        substituteRegex: false,

        minDepth: null,
        maxDepth: null,
    };

    try {
        /*
         * 你的 SillyTavern 版本中：
         *
         * extension_settings.regex
         *
         * 本身就是全局正则数组。
         */
        let regexScripts;

        if (Array.isArray(extension_settings.regex)) {
            regexScripts = extension_settings.regex;
        } else if (
            extension_settings.regex &&
            Array.isArray(extension_settings.regex.scripts)
        ) {
            /*
             * 清理之前错误写入的：
             * extension_settings.regex.scripts
             */
            regexScripts = extension_settings.regex.scripts;
            extension_settings.regex = regexScripts;
        } else if (
            extension_settings.regex &&
            Array.isArray(extension_settings.regex.global_scripts)
        ) {
            /*
             * 清理之前错误写入的：
             * extension_settings.regex.global_scripts
             */
            regexScripts = extension_settings.regex.global_scripts;
            extension_settings.regex = regexScripts;
        } else {
            regexScripts = [];
            extension_settings.regex = regexScripts;
        }

        /*
         * 查找已有同名正则。
         */
        // 兼容改名前写入的旧正则，找到后原地改名，不重复添加
        const existingIndex = regexScripts.findIndex(script => {
            return script?.scriptName === REGEX_SCRIPT_NAME ||
                script?.scriptName === LEGACY_REGEX_SCRIPT_NAME;
        });

        if (existingIndex >= 0) {
            /*
             * 已存在则更新。
             * 保留原来的 id，避免页面重复或排序异常。
             */
            const oldId = regexScripts[existingIndex].id;

            regexScripts[existingIndex] = {
                ...tutuRegexScript,
                ...regexScripts[existingIndex],
                id: oldId || tutuRegexScript.id,
                scriptName: REGEX_SCRIPT_NAME,
            };

            console.log(
                '[克制放映室] 全局正则已存在，已更新'
            );
        } else {
            /*
             * 当前版本全局正则应该直接 push 到
             * extension_settings.regex 数组。
             */
            regexScripts.push(tutuRegexScript);

            console.log(
                '[克制放映室] 已注入 extension_settings.regex'
            );
        }

        /*
         * 再次确保最终结构是数组，而不是：
         * { scripts: [...] }
         */
        extension_settings.regex = regexScripts;

        /*
         * 保存到 SillyTavern 设置。
         */
        saveSettingsDebounced();

        console.log(
            '[克制放映室] 当前全局正则数组：',
            extension_settings.regex
        );

        /*
         * 调试用。
         */
        window.tutuRegexDebug = extension_settings.regex;

    } catch (error) {
        console.error(
            '[克制放映室] 注入全局正则失败：',
            error
        );
    }
}





const STORAGE_KEY = 'tutu_theater_scenarios';
const SETTINGS_KEY = 'tutu_theater_settings';
const STYLE_LIBRARY_KEY = 'tutu_theater_style_library';
const STYLE_PACKAGE_TYPE = 'tutu-theater-style-package';
const STYLE_PACKAGE_VERSION = 1;

let tutuStyleLibrary = loadLocalJson(STYLE_LIBRARY_KEY, {
    manager: [],
    embed: [],
    quote: [],
});

function normalizeTutuStyleLibrary(data) {
    const result = {
        manager: [],
        embed: [],
        quote: [],
    };

    for (const target of Object.keys(result)) {
        result[target] = Array.isArray(data?.[target])
            ? data[target].filter(item =>
                item &&
                typeof item.id === 'string' &&
                typeof item.name === 'string' &&
                typeof item.css === 'string'
            )
            : [];
    }

    return result;
}

tutuStyleLibrary =
    normalizeTutuStyleLibrary(tutuStyleLibrary);

function saveTutuStyleLibrary() {
    localStorage.setItem(
        STYLE_LIBRARY_KEY,
        JSON.stringify(tutuStyleLibrary)
    );
}

function createTutuStyleId() {
    return typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tutu-style-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`;
}

function saveTutuStylePreset(target, name, css, oldId = '') {
    if (!['manager', 'embed', 'quote'].includes(target)) {
        throw new Error('未知样式类型');
    }

    name = String(name || '').trim();
    css = String(css || '').trim();

    if (!name) {
        throw new Error('请输入样式名称');
    }

    if (!css) {
        throw new Error('CSS 不能为空');
    }

    const list = tutuStyleLibrary[target];
    const index = list.findIndex(item => item.id === oldId);

    const record = {
        id: index >= 0 ? list[index].id : createTutuStyleId(),
        name,
        css,
        updatedAt: Date.now(),
    };

    if (index >= 0) {
        list[index] = record;
    } else {
        list.unshift(record);
    }

    saveTutuStyleLibrary();
    return record;
}

function deleteTutuStylePreset(target, id) {
    tutuStyleLibrary[target] =
        tutuStyleLibrary[target].filter(item => item.id !== id);

    saveTutuStyleLibrary();
}
const API_PRESETS_KEY = 'tutu_theater_api_presets';
const CHARACTER_CONTEXT_KEY = 'tutu_theater_character_context';
const CATEGORIES_KEY = 'tutu_theater_categories';
const AUX_PROMPTS_KEY =
    'tutu_theater_auxiliary_prompts';

const AUX_PROMPT_TYPES = [
    'jailbreak',
    'style',
    'extra',   // 附加：禁词、格式要求等，可多选
];

let tutuAuxPrompts = normalizeTutuAuxPrompts(
    loadLocalJson(AUX_PROMPTS_KEY, {
        jailbreak: [],
        style: [],
        extra: [],
    })
);

function normalizeTutuAuxPrompts(data) {
    const result = {
        jailbreak: [],
        style: [],
        extra: [],
    };

    AUX_PROMPT_TYPES.forEach(type => {
        result[type] = Array.isArray(data?.[type])
            ? data[type]
                .filter(item =>
                    item &&
                    typeof item.id === 'string' &&
                    typeof item.name === 'string' &&
                    typeof item.content === 'string'
                )
                .map(item => ({
                    id: item.id,
                    name: String(item.name || '').trim(),
                    content: String(item.content || '').trim(),
                    createdAt:
                        Number(item.createdAt) || Date.now(),
                    updatedAt:
                        Number(item.updatedAt) || Date.now(),
                }))
                .filter(item =>
                    item.name && item.content
                )
            : [];
    });

    return result;
}

function saveTutuAuxPrompts() {
    localStorage.setItem(
        AUX_PROMPTS_KEY,
        JSON.stringify(tutuAuxPrompts)
    );
}

function createTutuAuxPromptId() {
    return typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tutu-aux-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`;
}

function getTutuAuxPromptTypeLabel(type) {
    if (type === 'style') return '文风';
    if (type === 'extra') return '附加';
    return '破限';
}

/**
 * 每类当前启用的提示词 id 列表（支持多选）。
 * 兼容旧版单选字段 activeJailbreakPromptId / activeStylePromptId。
 */
function getTutuActiveAuxIds(type) {
    if (!tutuSettings.activeAuxPromptIds || typeof tutuSettings.activeAuxPromptIds !== 'object') {
        tutuSettings.activeAuxPromptIds = {};
    }

    const map = tutuSettings.activeAuxPromptIds;

    if (!Array.isArray(map[type])) {
        const legacy = type === 'jailbreak'
            ? tutuSettings.activeJailbreakPromptId
            : type === 'style'
                ? tutuSettings.activeStylePromptId
                : '';

        map[type] = legacy ? [String(legacy)] : [];
    }

    return map[type];
}

function setTutuActiveAuxIds(type, ids) {
    getTutuActiveAuxIds(type);
    tutuSettings.activeAuxPromptIds[type] = [...new Set(ids.map(String).filter(Boolean))];

    // 旧字段同步为第一项，兼容旧逻辑 / 降级
    if (type === 'jailbreak') tutuSettings.activeJailbreakPromptId = tutuSettings.activeAuxPromptIds[type][0] || '';
    if (type === 'style') tutuSettings.activeStylePromptId = tutuSettings.activeAuxPromptIds[type][0] || '';
}

/** 当前启用的某类提示词（按勾选顺序，过滤已删除的） */
function getActiveTutuAuxPrompts(type) {
    return getTutuActiveAuxIds(type)
        .map(id => findTutuAuxPrompt(type, id))
        .filter(Boolean);
}

function saveTutuAuxPromptRecord(
    type,
    name,
    content,
    oldId = ''
) {
    if (!AUX_PROMPT_TYPES.includes(type)) {
        throw new Error('未知提示词类型');
    }

    name = String(name || '').trim();
    content = String(content || '').trim();

    if (!name) {
        throw new Error('请输入提示词名称');
    }

    if (!content) {
        throw new Error('提示词内容不能为空');
    }

    const list = tutuAuxPrompts[type];

    const index = list.findIndex(
        item => item.id === oldId
    );

    const oldRecord =
        index >= 0 ? list[index] : null;

    const record = {
        id:
            oldRecord?.id ||
            createTutuAuxPromptId(),

        name,
        content,

        createdAt:
            oldRecord?.createdAt ||
            Date.now(),

        updatedAt: Date.now(),
    };

    if (index >= 0) {
        list[index] = record;
    } else {
        list.unshift(record);
    }

    saveTutuAuxPrompts();

    return record;
}

function deleteTutuAuxPromptRecord(type, id) {
    if (!AUX_PROMPT_TYPES.includes(type)) {
        return false;
    }

    const oldLength =
        tutuAuxPrompts[type].length;

    tutuAuxPrompts[type] =
        tutuAuxPrompts[type].filter(
            item => item.id !== id
        );

    saveTutuAuxPrompts();

    return tutuAuxPrompts[type].length !== oldLength;
}

function findTutuAuxPrompt(type, id) {
    if (!AUX_PROMPT_TYPES.includes(type)) {
        return null;
    }

    return tutuAuxPrompts[type].find(
        item => item.id === id
    ) || null;
}

const THEATER_CONTENT_KEY = 'tutu_theater_embed_contents';
const FAVORITES_KEY = 'tutu_theater_favorites';
const FAVORITES_EXPANDED_KEY =
    'tutu_theater_favorites_expanded_groups';
const TUTU_PACKAGE_TYPE = 'tutu-theater-package';
const TUTU_PACKAGE_VERSION = 1;

// 当前面板中正在显示的小剧场
let tutuCurrentResultContent = '';
let tutuCurrentResultCharacter = 'AI';
let tutuCurrentResultType = 'text';

let tutuCategories = loadLocalJson(CATEGORIES_KEY, []);

tutuCategories = Array.isArray(tutuCategories)
    ? tutuCategories
        .map(category => String(category || '').trim())
        .filter(Boolean)
    : [];


function loadLocalJson(key, defaultValue) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
        console.error(`读取 LocalStorage 失败：${key}`, error);
        return defaultValue;
    }
}
function getTutuTheaterStorageKey(mesIndex) {
    const context =
        SillyTavern.getContext();

    const chatId =
        context.chatId ||
        context.chat_metadata?.chat_id ||
        'default';

    const characterId =
        context.characterId !== undefined
            ? String(context.characterId)
            : 'none';

    const character =
        context.characterId !== undefined &&
        context.characters?.[context.characterId]
            ? context.characters[context.characterId]
            : null;

    const characterName =
        character?.name ||
        character?.data?.name ||
        'AI';

    const avatar =
        character?.avatar ||
        character?.data?.avatar ||
        '';

    return [
        chatId,
        characterId,
        characterName,
        avatar,
        mesIndex,
    ].join('::');
}


function saveTutuTheaterContent(mesIndex, content) {
    const stored =
        loadLocalJson(
            THEATER_CONTENT_KEY,
            {}
        );

    const key =
        getTutuTheaterStorageKey(mesIndex);

stored[key] = {
    content: String(content || ''),

    characterName:
        getCurrentTutuCharacterName(),

    characterAvatar:
        getCurrentTutuCharacterAvatar(),

    savedAt: Date.now(),
};

    /*
     * 只保留最近 100 条。
     */
    const keys = Object.keys(stored);

    if (keys.length > 100) {
        keys
            .slice(0, keys.length - 100)
            .forEach(key => {
                delete stored[key];
            });
    }

    localStorage.setItem(
        THEATER_CONTENT_KEY,
        JSON.stringify(stored)
    );
}


function getTutuStoredTheaterContent(mesIndex) {
    const stored =
        loadLocalJson(
            THEATER_CONTENT_KEY,
            {}
        );

    const key =
        getTutuTheaterStorageKey(mesIndex);

    const value = stored[key];

    /*
     * 兼容旧版本以前直接保存字符串的格式。
     */
if (typeof value === 'string') {
    return {
        content: value,

        characterName:
            getCurrentTutuCharacterName(),

        characterAvatar:
            getCurrentTutuCharacterAvatar(),
    };
}


    if (!value || typeof value !== 'object') {
        return null;
    }

return {
    content: String(value.content || ''),

    characterName:
        String(
            value.characterName ||
            getCurrentTutuCharacterName()
        ),

    characterAvatar:
        String(
            value.characterAvatar ||
            findTutuCharacterAvatarByName(
                value.characterName
            ) ||
            ''
        ),
};
}

function loadTutuFavorites() {
    const data = loadLocalJson(FAVORITES_KEY, []);
    return Array.isArray(data) ? data : [];
}

function saveTutuFavorites(favorites) {
    localStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(favorites)
    );
}

function getCurrentTutuCharacterName() {
    return String(
        tutuCurrentCharacterContext?.characterName ||
        tutuCurrentResultCharacter ||
        'AI'
    ).trim() || 'AI';
}
/**
 * 获取当前 SillyTavern 角色的头像文件名
 */
function getCurrentTutuCharacterAvatar() {
    try {
        const context = SillyTavern.getContext();

        const character =
            context.characterId !== undefined &&
            context.characters?.[context.characterId]
                ? context.characters[context.characterId]
                : null;

        return String(
            character?.avatar ||
            character?.data?.avatar ||
            ''
        ).trim();
    } catch (error) {
        console.warn(
            '[克制放映室] 获取当前角色头像失败：',
            error
        );

        return '';
    }
}

/**
 * 根据角色名称从 SillyTavern 角色列表中寻找头像。
 *
 * 主要用于兼容旧收藏：
 * 旧收藏里没有 characterAvatar 字段，
 * 可以尝试按照角色名称补找。
 */
function findTutuCharacterAvatarByName(characterName) {
    const targetName =
        String(characterName || '').trim();

    if (!targetName) {
        return '';
    }

    try {
        const context = SillyTavern.getContext();

        const characters =
            Array.isArray(context.characters)
                ? context.characters
                : [];

        const character = characters.find(item => {
            const name = String(
                item?.name ||
                item?.data?.name ||
                ''
            ).trim();

            return name === targetName;
        });

        return String(
            character?.avatar ||
            character?.data?.avatar ||
            ''
        ).trim();
    } catch (error) {
        console.warn(
            '[克制放映室] 按角色名称查找头像失败：',
            error
        );

        return '';
    }
}

/**
 * 获取收藏记录对应的头像文件名
 */
function getTutuFavoriteCharacterAvatar(
    favorite,
    characterName = ''
) {
    const savedAvatar = String(
        favorite?.characterAvatar || ''
    ).trim();

    if (savedAvatar) {
        return savedAvatar;
    }

    return findTutuCharacterAvatarByName(
        characterName ||
        favorite?.characterName ||
        ''
    );
}

/**
 * 将 SillyTavern 角色头像文件名转换成图片地址。
 *
 * SillyTavern 通常通过：
 * /thumbnail?type=avatar&file=文件名
 * 提供角色头像缩略图。
 */
function getTutuCharacterAvatarUrl(avatar) {
    const value = String(avatar || '').trim();

    if (!value) {
        return '';
    }

    /*
     * 兼容已经是完整地址的情况。
     */
    if (
        /^(?:https?:|data:|blob:)/i.test(value) ||
        value.startsWith('/')
    ) {
        return value;
    }

    return (
        '/thumbnail?type=avatar&file=' +
        encodeURIComponent(value)
    );
}

/**
 * 给收藏分组中的头像节点设置图片。
 *
 * 如果缩略图接口加载失败，会尝试 /characters/文件名；
 * 再失败则显示默认用户图标。
 */
function setTutuFavoriteAvatar(
    $container,
    avatar
) {
    const value = String(avatar || '').trim();

    const $image =
        $container.find(
            '.tutu-favorite-character-avatar'
        );

    const $fallback =
        $container.find(
            '.tutu-favorite-character-avatar-fallback'
        );

    if (!value || !$image.length) {
        $image.hide();
        $fallback.show();
        return;
    }

    const thumbnailUrl =
        getTutuCharacterAvatarUrl(value);

    const characterFileUrl =
        /^(?:https?:|data:|blob:|\/)/i.test(value)
            ? value
            : `/characters/${encodeURIComponent(value)}`;

    let triedCharacterFile = false;

    $fallback.hide();

    $image
        .off('error.tutuAvatar')
        .on('error.tutuAvatar', function () {
            if (
                !triedCharacterFile &&
                characterFileUrl !== thumbnailUrl
            ) {
                triedCharacterFile = true;
                this.src = characterFileUrl;
                return;
            }

            $(this).hide();
            $fallback.show();
        })
        .attr('src', thumbnailUrl)
        .show();
}

function createTutuFavoriteRecord(content, title = '') {
    const text = String(content || '').trim();

    const characterName =
        getCurrentTutuCharacterName();
    const characterAvatar =
        getCurrentTutuCharacterAvatar();


    const cleanTitle =
        String(title || '').trim() ||
        '未命名小剧场';

    return {
        id:
            typeof crypto?.randomUUID === 'function'
                ? crypto.randomUUID()
                : `favorite-${Date.now()}-${Math.random()
                    .toString(16)
                    .slice(2)}`,

        title: cleanTitle,

        content: text,

        type: isProbablyHtml(text)
            ? 'html'
            : 'text',

        characterName,
        characterAvatar,

        createdAt: Date.now(),
    };
}
function favoriteCurrentTutuTheater() {
    const content =
        String(tutuCurrentResultContent || '').trim();

    if (!content) {
        toastr.warning('当前没有可以收藏的小剧场');
        return;
    }

    favoriteTutuContent(
        content,
        getCurrentTutuCharacterName()
    );

    $('#tutu_favorite_current_btn')
        .addClass('active')
        .find('i')
        .attr(
            'class',
            'fa-solid fa-heart'
        );
}


function removeTutuFavorite(id) {
    const favorites = loadTutuFavorites()
        .filter(item => item.id !== id);

    saveTutuFavorites(favorites);

    renderTutuFavorites();
}
function renameTutuFavorite(id) {
    const favorites = loadTutuFavorites();


    const favorite =
        favorites.find(item => item.id === id);

    if (!favorite) {
        toastr.error('找不到这条收藏');
        return;
    }

    const oldTitle =
        String(
            favorite.title ||
            '未命名小剧场'
        ).trim();

    const newTitleInput = window.prompt(
        '请输入新的收藏名称：',
        oldTitle
    );

    if (newTitleInput === null) {
        return;
    }

    const newTitle =
        String(newTitleInput || '').trim();

    if (!newTitle) {
        toastr.warning('收藏名称不能为空');
        return;
    }

    favorite.title = newTitle;

    saveTutuFavorites(favorites);
    renderTutuFavorites();

    toastr.success('收藏名称已修改');
}
function loadTutuFavoriteExpandedGroups() {
    const data = loadLocalJson(
        FAVORITES_EXPANDED_KEY,
        []
    );

    return new Set(
        Array.isArray(data)
            ? data.map(item => String(item))
            : []
    );
}

function saveTutuFavoriteExpandedGroups(groups) {
    localStorage.setItem(
        FAVORITES_EXPANDED_KEY,
        JSON.stringify(Array.from(groups))
    );
}

function clearTutuFavorites() {
    const favorites = loadTutuFavorites();

    if (!favorites.length) {
        toastr.info('收藏列表已经是空的');
        return;
    }

    if (!confirm('确定要清空全部小剧场收藏吗？')) {
        return;
    }

    saveTutuFavorites([]);

    renderTutuFavorites();

    toastr.success('收藏已清空');
}

function formatTutuFavoriteTime(timestamp) {
    if (!timestamp) {
        return '';
    }

    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return '';
    }
}

function renderTutuFavorites() {
    const $list =
        $('#tutu_favorites_list');

    if (!$list.length) {
        return;
    }

    const favorites =
        loadTutuFavorites();

    $list.empty();

    if (!favorites.length) {
        $list.html(`
            <div class="tutu-empty-library">
                <i class="fa-regular fa-heart"></i>
                <div>还没有收藏的小剧场</div>
                <small>
                    生成内容后，点击心形按钮即可收藏
                </small>
            </div>
        `);

        return;
    }

    /*
     * 旧版本收藏可能没有 title 字段。
     * 这里自动补充默认名称，但不立即写入，
     * 避免渲染时频繁修改 LocalStorage。
     */
    favorites.forEach(item => {
        if (!item.title) {
            item.title = '未命名小剧场';
        }

        if (!item.characterName) {
            item.characterName = 'AI';
        }
    });

    /*
     * 按角色名称分组
     */
    const groupedFavorites =
        new Map();

    favorites.forEach(item => {
        const characterName =
            String(
                item.characterName || 'AI'
            ).trim() || 'AI';

        if (!groupedFavorites.has(characterName)) {
            groupedFavorites.set(
                characterName,
                []
            );
        }

        groupedFavorites
            .get(characterName)
            .push(item);
    });

    /*
     * 读取上一次的展开状态
     *
     * 没有记录时，默认全部折叠
     */
const expandedGroups =
    loadTutuFavoriteExpandedGroups();

/*
 * 没有任何展开状态记录时，默认展开全部分组。
 * 用户操作过分组后，再按照保存的状态恢复。
 */
const hasSavedExpandedState =
    localStorage.getItem(
        FAVORITES_EXPANDED_KEY
    ) !== null;

groupedFavorites.forEach(
    (items, characterName) => {
        const isExpanded =
            !hasSavedExpandedState ||
            expandedGroups.has(characterName);


            const $group = $(`
                <div class="tutu-favorite-group">
                    <div class="tutu-favorite-group-header">
<div class="tutu-favorite-group-title">
    <span class="tutu-favorite-character-avatar-box">
        <img
            class="tutu-favorite-character-avatar"
            alt=""
            loading="lazy">

        <i
            class="
                fa-solid
                fa-user
                tutu-favorite-character-avatar-fallback
            ">
        </i>
    </span>

    <span class="tutu-favorite-character-name"></span>
</div>


                        <div class="tutu-favorite-group-right">
                            <span class="tutu-favorite-group-count">
                                ${items.length} 条收藏
                            </span>

                            <i class="
                                fa-solid
                                ${isExpanded
                                    ? 'fa-chevron-up'
                                    : 'fa-chevron-down'}
                                tutu-favorite-group-arrow
                            "></i>
                        </div>
                    </div>

                    <div class="tutu-favorite-group-list"
                         style="display:${isExpanded ? 'flex' : 'none'};">
                    </div>
                </div>
            `);

            /*
             * 使用 .text() 设置角色名，
             * 避免角色名中包含 HTML 造成注入。
             */
$group
    .find('.tutu-favorite-character-name')
    .text(characterName);

/*
 * 优先从这个分组的收藏记录中读取头像。
 * 如果是旧收藏没有保存头像，则按照角色名从
 * SillyTavern 的角色列表中补找。
 */
const avatarItem =
    items.find(item =>
        String(
            item?.characterAvatar || ''
        ).trim()
    );

const characterAvatar =
    getTutuFavoriteCharacterAvatar(
        avatarItem || items[0],
        characterName
    );

setTutuFavoriteAvatar(
    $group,
    characterAvatar
);

const $groupList =
    $group.find(
        '.tutu-favorite-group-list'
    );


            items.forEach(item => {
                const content =
                    String(item.content || '');

                const title =
                    String(
                        item.title ||
                        '未命名小剧场'
                    );

                const time =
                    escapeHtml(
                        formatTutuFavoriteTime(
                            item.createdAt
                        )
                    );

const favoriteRendered =
    buildTutuRenderedContent(content);

const isHtmlFavorite =
    favoriteRendered.isHtml;

const preview =
    isHtmlFavorite
        ? ''
        : content;


                const $card = $(`
                    <div
                        class="tutu-favorite-card"
                        data-id="${escapeHtml(item.id)}">

                        <div class="tutu-favorite-card-header">
<div class="tutu-favorite-card-info">
    <div class="tutu-favorite-card-title-row">
        <span class="tutu-favorite-card-avatar-box">
            <img
                class="tutu-favorite-card-avatar"
                alt=""
                loading="lazy">

            <i
                class="
                    fa-solid
                    fa-user
                    tutu-favorite-card-avatar-fallback
                ">
            </i>
        </span>

        <div class="tutu-favorite-card-title-content">
            <div class="tutu-favorite-title"></div>

            <div class="tutu-favorite-time">
                ${time}
            </div>
        </div>
    </div>
</div>
                            <div class="
                                tutu-favorite-actions
                            ">
                                <div
                                    class="
                                        menu_button
                                        margin0
                                        tutu-favorite-edit-btn
                                    "
                                    title="编辑名称">
                                    <i class="fa-solid fa-pen"></i>
                                </div>

${isHtmlFavorite ? '' : `
<div
    class="
        menu_button
        margin0
        tutu-favorite-bubble-btn
    "
    role="button"
    tabindex="0"
    title="修正气泡：改说话人、对话 / 聊天气泡 / 普通引用（正文里双击也能改）">
    <i class="fa-solid fa-comment-dots"></i>
</div>`}

<div
    class="
        menu_button
        margin0
        tutu-favorite-export-btn
    "
    title="导出">
    <i class="fa-solid fa-download"></i>
</div>

<div
    class="
        menu_button
        margin0
        tutu-favorite-fullscreen-btn
    "
    title="全屏查看">
    <i class="fa-solid fa-expand"></i>
</div>

<div
    class="
        menu_button
        margin0
        tutu-favorite-delete-btn
    "
    title="删除收藏">
    <i class="fa-solid fa-trash"></i>
</div>

                            </div>
                        </div>

<div class="tutu-favorite-preview${isHtmlFavorite ? '' : ' tutu-typo-plain'}${!isHtmlFavorite && isTutuTypographyFormatActive() ? ' tutu-typo-formatted' : ''}">
    ${
        isHtmlFavorite
            ? `
                <div class="tutu-favorite-html-actions">
                    <button
                        type="button"
                        class="tutu-favorite-html-preview-btn">
                        <i class="fa-solid fa-display"></i>
                        预览 HTML 小剧场
                    </button>

                    <span class="tutu-favorite-html-tip">
                        点击按钮展开预览
                    </span>
                </div>

                <div
                    class="tutu-favorite-html-container"
                    style="display:none;">
                    <iframe
                        class="tutu-favorite-html-iframe"
                        sandbox="allow-scripts allow-forms allow-modals">
                    </iframe>
                </div>
            `
            : isTutuTypographyFormatActive()
                ? formatTutuPlainHtml(preview)
                : escapeHtml(preview)
    }
</div>

                    </div>
                `);
$card
    .find('.tutu-favorite-title')
    .text(title);
const itemAvatar =
    getTutuFavoriteCharacterAvatar(
        item,
        characterName
    );

const $cardAvatar =
    $card.find(
        '.tutu-favorite-card-avatar'
    );

const $cardAvatarFallback =
    $card.find(
        '.tutu-favorite-card-avatar-fallback'
    );

if (itemAvatar && $cardAvatar.length) {
    const thumbnailUrl =
        getTutuCharacterAvatarUrl(
            itemAvatar
        );

    const originalUrl =
        /^(?:https?:|data:|blob:|\/)/i.test(
            itemAvatar
        )
            ? itemAvatar
            : `/characters/${encodeURIComponent(
                itemAvatar
            )}`;

    let triedOriginal = false;

    $cardAvatarFallback.hide();

    $cardAvatar
        .on('error', function () {
            if (
                !triedOriginal &&
                originalUrl !== thumbnailUrl
            ) {
                triedOriginal = true;
                this.src = originalUrl;
                return;
            }

            $(this).hide();
            $cardAvatarFallback.show();
        })
        .attr('src', thumbnailUrl)
        .show();
} else {
    $cardAvatar.hide();
    $cardAvatarFallback.show();
}
/*
 * HTML 收藏不直接拼进模板，
 * 而是使用 iframe.srcdoc 安全地设置预览内容。
 */
if (isHtmlFavorite) {
    const iframe =
        $card.find('.tutu-favorite-html-iframe')[0];

    if (iframe) {
        iframe.srcdoc = favoriteRendered.html;
    }
}

$groupList.append($card);

            });

            $list.append($group);
        }
    );
}


let tutuScenarios = loadLocalJson(STORAGE_KEY, []);
// 展开的分类集合，可以同时展开多个
const EXPANDED_KEY = 'tutu_theater_expanded_categories';

const tutuStoredExpanded = loadLocalJson(EXPANDED_KEY, null);

let tutuExpandedCategories = new Set(
    Array.isArray(tutuStoredExpanded) ? tutuStoredExpanded : []
);

// 第一次使用时默认全部展开
let tutuExpandedInitialized = Array.isArray(tutuStoredExpanded);

function saveTutuExpandedCategories() {
    localStorage.setItem(
        EXPANDED_KEY,
        JSON.stringify(Array.from(tutuExpandedCategories))
    );
}

let tutuIsGenerating = false;
// 当前生成的令牌 { cancelled, controller, onCancel }
let tutuCurrentGeneration = null;
let tutuLastAutoMessageKey = '';
let tutuSettings = loadLocalJson(SETTINGS_KEY, {
    provider: 'main',
    endpoint: '',
    apiKey: '',
    model: '',

    autoGenerateEnabled: false,
    autoGenerateMode: 'current',
    autoSequenceIndex: 0,
});
tutuSettings = {
    provider: 'main',
    endpoint: '',
    apiKey: '',
    model: '',
    activeJailbreakPromptId: '',
    activeStylePromptId: '',
    activeAuxPromptIds: null,   // { jailbreak: [], style: [], extra: [] }，null 时从旧字段迁移
    // 生成格式：text 纯文本（自动适配排版） / html 交互网页
    outputFormat: 'text',
    // 副 API 最大输出长度（max_tokens），0 = 不发送
    secondaryMaxTokens: 0,
    // 自定义 HTML 生成要求，留空使用内置版本
    htmlPromptCustom: '',
    auxPromptsEnabled: false,
    autoGenerateEnabled: false,

    embedDefaultCollapsed: false,
    autoGenerateMode: 'current',
    autoGenerateScope: 'all',
    autoGenerateCategory: '',
    autoSequenceIndex: 0,
    autoSequenceIndexes: {},

outputMode: 'panel',

// 界面外观
uiTheme: 'classic',
uiCustomCss: '',

stylePresetIds: {
    manager: '',
    embed: '',
    quote: '',
},

// 自定义捕捉标签
captureTagName: '',

// 渲染：预设正则 / CSS
renderRegexEnabled: true,
renderCssEnabled: true,

// 历史聊天记录：只读标签 / 排除标签（逗号分隔）
historyIncludeTags: '',
historyExcludeTags: '',
// 历史聊天记录：自动排除 HTML 注释
historyExcludeComments: true,

    ...tutuSettings,
};
tutuSettings.stylePresetIds = {
    manager: '',
    embed: '',
    quote: '',
    ...(tutuSettings.stylePresetIds || {}),
};

if (typeof tutuSettings.embedDefaultCollapsed !== 'boolean') {
    tutuSettings.embedDefaultCollapsed = false;
}
if (typeof tutuSettings.auxPromptsEnabled !== 'boolean') {
    tutuSettings.auxPromptsEnabled = Boolean(
        tutuSettings.activeJailbreakPromptId ||
        tutuSettings.activeStylePromptId
    );
}

// 读取历史聊天记录的全局默认：旧版本只有按角色保存，迁移时沿用任一角色已开启的设置
if (typeof tutuSettings.historyIncludeEnabled !== 'boolean') {
    const oldContexts = Object.values(
        loadLocalJson(CHARACTER_CONTEXT_KEY, {}) || {}
    );
    const enabledContext = oldContexts.find(item => item?.includeHistory);

    tutuSettings.historyIncludeEnabled = Boolean(enabledContext);
    tutuSettings.historyLimitDefault =
        Number(enabledContext?.historyLimit) || 20;
}

if (!(Number(tutuSettings.historyLimitDefault) > 0)) {
    tutuSettings.historyLimitDefault = 20;
}

if (typeof tutuSettings.renderAntiClip !== 'boolean') {
    tutuSettings.renderAntiClip = true;
}

tutuSettings.typography = {
    ...getDefaultTutuTypography(),
    ...(tutuSettings.typography || {}),
};

/**
 * 立即把当前设置写入本地，所有改动都走这里，不再依赖「保存设置」按钮。
 */
function persistTutuSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(tutuSettings));
    } catch (error) {
        console.warn('[克制放映室] 保存设置失败：', error);
    }
}


let tutuApiPresets = loadLocalJson(API_PRESETS_KEY, []);

let tutuCharacterContexts = loadLocalJson(
    CHARACTER_CONTEXT_KEY,
    {}
);

// ==========================================
// 渲染库：预设正则 + CSS
// ==========================================
const RENDER_LIBRARY_KEY = 'tutu_theater_render_library';

function normalizeTutuRenderLibrary(data) {
    const source = data && typeof data === 'object' ? data : {};

    const regex = (Array.isArray(source.regex) ? source.regex : [])
        .filter(item => item && typeof item === 'object' && item.findRegex)
        .map(item => ({
            id: String(item.id || createTutuRenderId('rx')),
            scriptName: String(item.scriptName || '未命名正则'),
            findRegex: String(item.findRegex || ''),
            replaceString: String(item.replaceString ?? ''),
            trimStrings: Array.isArray(item.trimStrings)
                ? item.trimStrings.map(String)
                : [],
            substituteRegex: Number(item.substituteRegex) || 0,
            source: String(item.source || ''),
            enabled: item.enabled !== false,
            // 所属分组（空 = 未分组）
            groupId: String(item.groupId || ''),
            // 单独绑定的小剧场条目 id（空 = 跟随分组 / 全局）
            bindScenarioIds: normalizeTutuIdList(item.bindScenarioIds),
        }));

    const css = (Array.isArray(source.css) ? source.css : [])
        .filter(item => item && typeof item === 'object')
        .map(item => ({
            id: String(item.id || createTutuRenderId('css')),
            name: String(item.name || '未命名 CSS'),
            css: String(item.css || ''),
            source: String(item.source || ''),
            enabled: item.enabled !== false,
            builtin: String(item.builtin || ''),
        }));

    const groups = (Array.isArray(source.groups) ? source.groups : [])
        .filter(item => item && typeof item === 'object')
        .map(item => ({
            id: String(item.id || createTutuRenderId('grp')),
            name: String(item.name || '未命名分组'),
            enabled: item.enabled !== false,
            bindScenarioIds: normalizeTutuIdList(item.bindScenarioIds),
        }));

    // 指向已删除分组的正则归为未分组
    const groupIds = new Set(groups.map(group => group.id));
    regex.forEach(item => {
        if (item.groupId && !groupIds.has(item.groupId)) {
            item.groupId = '';
        }
    });

    return { regex, css, groups };
}

function normalizeTutuIdList(value) {
    return Array.isArray(value)
        ? Array.from(new Set(value.map(String).filter(Boolean)))
        : [];
}

// ==========================================
// 小剧场条目 id 与生成内容的来源记录
// ==========================================
const CONTENT_SCENARIO_KEY = 'tutu_theater_content_scenarios';
const CONTENT_SCENARIO_LIMIT = 500;

/**
 * 给没有 id 的剧本补上稳定 id，绑定渲染正则时依赖它。
 * 返回是否有改动。
 */
function ensureTutuScenarioIds() {
    if (!Array.isArray(tutuScenarios)) return false;

    let changed = false;

    tutuScenarios.forEach(item => {
        if (item && typeof item === 'object' && !item.id) {
            item.id = createTutuRenderId('sc');
            changed = true;
        }
    });

    if (changed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tutuScenarios));
    }

    return changed;
}

/**
 * 根据剧本正文找到对应条目 id。
 * 手动修改过的情境匹配不到任何条目，返回空字符串。
 */
function findTutuScenarioIdByPrompt(prompt) {
    const text = String(prompt || '').trim();

    if (!text || !Array.isArray(tutuScenarios)) return '';

    ensureTutuScenarioIds();

    const item = tutuScenarios.find(
        scenario => String(scenario?.prompt || '').trim() === text
    );

    return item?.id || '';
}

function hashTutuContent(content) {
    const text = String(content || '').trim();
    let h1 = 0x811c9dc5;
    let h2 = 0;

    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, 16777619);
        h2 = (Math.imul(h2, 31) + code) | 0;
    }

    return `${text.length}_${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
}

/**
 * 记录“这段生成内容来自哪个剧本”。
 * 面板、嵌入楼层、全屏、收藏都能按内容查回来源，
 * 不需要在每条调用链上传递 id。
 */
function rememberTutuContentScenario(content, scenarioId) {
    if (!String(content || '').trim()) return;

    const stored = loadLocalJson(CONTENT_SCENARIO_KEY, {});
    const key = hashTutuContent(content);

    delete stored[key];
    stored[key] = String(scenarioId || '');

    const keys = Object.keys(stored);

    if (keys.length > CONTENT_SCENARIO_LIMIT) {
        keys
            .slice(0, keys.length - CONTENT_SCENARIO_LIMIT)
            .forEach(oldKey => delete stored[oldKey]);
    }

    localStorage.setItem(CONTENT_SCENARIO_KEY, JSON.stringify(stored));
}

function getTutuContentScenarioId(content) {
    const stored = loadLocalJson(CONTENT_SCENARIO_KEY, {});
    return String(stored[hashTutuContent(content)] || '');
}

/**
 * 读取对话补全预设里绑定的正则。
 * 不同版本 / 插件存放位置不同，按常见位置依次查找。
 */
function getTutuPresetRegexScripts(preset) {
    const candidates = [
        preset?.extensions?.regex_scripts,
        preset?.extensions?.regexScripts,
        preset?.extensions?.SPreset?.RegexBinding?.regexes,
        preset?.extensions?.SPreset?.RegexBinding,
        preset?.regex_scripts,
    ];

    for (const item of candidates) {
        if (Array.isArray(item) && item.length) {
            return item;
        }
    }

    return [];
}

function createTutuRenderId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

let tutuRenderLibrary = normalizeTutuRenderLibrary(
    loadLocalJson(RENDER_LIBRARY_KEY, {})
);

function saveTutuRenderLibrary() {
    localStorage.setItem(
        RENDER_LIBRARY_KEY,
        JSON.stringify(tutuRenderLibrary)
    );
}

/**
 * 把 "/pattern/flags" 形式的字符串转成 RegExp。
 * 不带斜杠时按普通正则处理（默认 g）。
 */
function parseTutuRegexString(input) {
    const value = String(input || '');

    if (!value) {
        return null;
    }

    const match = value.match(/^\/([\s\S]+)\/([dgimsuvy]*)$/);

    try {
        if (match) {
            return new RegExp(match[1], match[2]);
        }

        return new RegExp(value, 'g');
    } catch (error) {
        console.warn('[克制放映室] 正则无效：', value, error);
        return null;
    }
}

function substituteTutuMacros(text) {
    const value = String(text ?? '');

    try {
        const context = SillyTavern.getContext();

        if (typeof context.substituteParams === 'function') {
            return context.substituteParams(value);
        }

        return value
            .replace(/\{\{char\}\}/gi, context.name2 || '')
            .replace(/\{\{user\}\}/gi, context.name1 || '');
    } catch {
        return value;
    }
}

function escapeTutuRegexLiteral(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 自带的正则执行实现，行为与 SillyTavern 正则扩展保持一致：
 * - 支持 {{match}} / $0 / $1 / $<name>
 * - 支持 trimStrings
 * - 支持 {{char}} {{user}} 宏
 */
function runTutuRegexFallback(script, text) {
    let findText = script.findRegex;

    // 0 不替换宏；1 原样替换宏；2 替换宏并转义为正则字面量
    if (Number(script.substituteRegex) === 1) {
        findText = substituteTutuMacros(findText);
    } else if (Number(script.substituteRegex) === 2) {
        findText = findText.replace(
            /\{\{(char|user)\}\}/gi,
            macro => escapeTutuRegexLiteral(substituteTutuMacros(macro))
        );
    }

    const regex = parseTutuRegexString(findText);

    if (!regex) {
        return text;
    }

    const trimList = (script.trimStrings || [])
        .map(item => substituteTutuMacros(item))
        .filter(Boolean);

    return text.replace(regex, (...args) => {
        const hasGroups =
            typeof args[args.length - 1] === 'object' &&
            args[args.length - 1] !== null;

        const groups = hasGroups ? args[args.length - 1] : {};
        const offsetIndex = hasGroups ? args.length - 3 : args.length - 2;
        const captures = args.slice(0, offsetIndex);

        const trimValue = value => {
            let result = String(value ?? '');

            trimList.forEach(trim => {
                result = result.replace(
                    new RegExp(escapeTutuRegexLiteral(trim), 'g'),
                    ''
                );
            });

            return result;
        };

        let output = String(script.replaceString ?? '')
            .replace(/\{\{match\}\}/gi, '$0');

        output = output.replace(
            /\$(\d+)|\$<([^>]+)>/g,
            (whole, numberText, groupName) => {
                if (numberText !== undefined) {
                    const value = captures[Number(numberText)];
                    return value === undefined ? '' : trimValue(value);
                }

                const value = groups?.[groupName];
                return value === undefined ? '' : trimValue(value);
            }
        );

        return substituteTutuMacros(output);
    });
}

function runTutuRegexScript(script, text) {
    /*
     * 优先使用 SillyTavern 自带的正则引擎，
     * 保证与酒馆渲染结果完全一致；
     * 引擎不可用或出错时使用自带实现。
     */
    const nativeRunner = tutuRegexEngine?.runRegexScript;

    if (typeof nativeRunner === 'function') {
        try {
            const result = nativeRunner(
                {
                    id: script.id,
                    scriptName: script.scriptName,
                    findRegex: script.findRegex,
                    replaceString: script.replaceString,
                    trimStrings: script.trimStrings || [],
                    substituteRegex: script.substituteRegex || 0,
                    disabled: false,
                    placement: [2],
                    markdownOnly: false,
                    promptOnly: false,
                    runOnEdit: false,
                    minDepth: null,
                    maxDepth: null,
                },
                text
            );

            if (typeof result === 'string') {
                return result;
            }
        } catch (error) {
            console.warn(
                '[克制放映室] 酒馆正则引擎执行失败，改用内置实现：',
                error
            );
        }
    }

    return runTutuRegexFallback(script, text);
}

/**
 * 判断一条渲染正则是否作用于指定剧本：
 * 1. 正则自身关闭、所属分组关闭 → 不生效
 * 2. 正则单独绑定了条目 → 只对这些条目生效
 * 3. 否则分组绑定了条目 → 只对分组绑定的条目生效
 * 4. 都没绑定 → 全局生效
 */
function isTutuRegexActiveFor(script, scenarioId) {
    if (!script.enabled) return false;

    const group = script.groupId
        ? tutuRenderLibrary.groups.find(item => item.id === script.groupId)
        : null;

    if (group && !group.enabled) return false;

    const binding = script.bindScenarioIds?.length
        ? script.bindScenarioIds
        : group?.bindScenarioIds || [];

    if (!binding.length) return true;

    return Boolean(scenarioId) && binding.includes(scenarioId);
}

function applyTutuRenderRegex(text, scenarioId = '') {
    let result = String(text || '');

    if (!tutuSettings.renderRegexEnabled) {
        return result;
    }

    tutuRenderLibrary.regex
        .filter(script => isTutuRegexActiveFor(script, scenarioId))
        .forEach(script => {
            try {
                result = runTutuRegexScript(script, result);
            } catch (error) {
                console.warn(
                    `[克制放映室] 正则「${script.scriptName}」执行失败：`,
                    error
                );
            }
        });

    return result;
}

function getTutuRenderCssText() {
    if (!tutuSettings.renderCssEnabled) {
        return '';
    }

    return tutuRenderLibrary.css
        .filter(item => item.enabled && item.css.trim())
        .map(item => `/* ${item.name.replace(/\*\//g, '')} */\n${item.css}`)
        .join('\n\n');
}

/**
 * 从文本中提取 CSS：
 * 1. 有 <style> 标签时取标签内容
 * 2. 否则把整段当作 CSS
 */
function extractTutuCssText(text) {
    const value = String(text || '');
    const blocks = [];

    value.replace(
        /<style[^>]*>([\s\S]*?)<\/style>/gi,
        (_, css) => {
            blocks.push(css.trim());
            return '';
        }
    );

    return blocks.length
        ? blocks.join('\n\n')
        : value.trim();
}

/**
 * 统一渲染管线：
 * 原始内容 → 预设正则 → 注入 CSS → 返回 { html, isHtml }
 *
 * 源码模式、导出、收藏仍使用原始内容，
 * 只有显示时经过这条管线。
 */
function buildTutuRenderedContent(content, scenarioId) {
    const raw = String(content || '');
    const finalScenarioId =
        scenarioId === undefined
            ? getTutuContentScenarioId(raw)
            : String(scenarioId || '');
    const replaced = applyTutuRenderRegex(raw, finalScenarioId);
    const cssText = getTutuRenderCssText();
    const regexChanged = replaced !== raw;
    const isHtml = isProbablyHtml(replaced);

    if (!isHtml && !regexChanged && !cssText) {
        return { html: raw, isHtml: false };
    }

    const styleTag = cssText
        ? `<style id="tutu-render-css">\n${cssText.replace(/<\/style/gi, '<\\/style')}\n</style>`
        : '';

    /*
     * 排版美化只作用于纯文本（txt）小剧场：
     * 按原始内容判断，原文是纯文本时才应用（即使渲染正则 / CSS 让它进了 iframe）；
     * HTML 小剧场单独一类，不受排版影响。
     */
    const typoCss = isProbablyHtml(raw)
        ? ''
        : buildTutuTypographyIframeCss();

    const typoTag = typoCss
        ? `<style id="tutu-typography-css">\n${typoCss}\n</style>`
        : '';

    let html = buildTutuRenderedDocument(
        replaced,
        `${typoTag}\n${styleTag}`,
        isHtml,
        regexChanged,
        // 原文和正则结果都是纯文本时，用结构化排版（段落 / 气泡 / 对话块）
        Boolean(typoCss) && !isHtml && !regexChanged
    );

    html = injectTutuAntiClip(html);

    return { html, isHtml: true };
}

/**
 * iframe 里的结构化排版：双击时把位置和行号报给外层，外层弹出修正菜单。
 * iframe 没有 allow-same-origin，外层无法直接监听里面的事件。
 */
const TUTU_IFRAME_DBLCLICK_SCRIPT = `<script>
(function () {
    document.addEventListener('dblclick', function (event) {
        var block = event.target.closest && event.target.closest('[data-tutu-line][data-tutu-src]');
        if (!block) return;
        event.preventDefault();
        try { window.getSelection().removeAllRanges(); } catch (e) {}
        var nameEl = block.querySelector('.tutu-dialogue-name, .tutu-chat-name');
        var onName = Boolean(event.target.closest('.tutu-dialogue-name, .tutu-chat-name, .tutu-chat-avatar'));
        parent.postMessage({
            type: 'tutu-theater-line-dblclick',
            src: block.getAttribute('data-tutu-src'),
            line: Number(block.getAttribute('data-tutu-line')),
            x: event.clientX,
            y: event.clientY,
            onName: onName,
            name: nameEl ? nameEl.textContent : '',
            kind: block.classList.contains('tutu-dialogue') ? 'speech'
                : block.classList.contains('tutu-chat-row') ? 'chat'
                : block.querySelector('.tutu-emph') ? 'emph' : 'plain'
        }, '*');
    });
})();
<\/script>`;

function buildTutuRenderedDocument(replaced, styleTag, isHtml, regexChanged, formatPlain = false) {
    let html;

    if (/<\/head>/i.test(replaced)) {
        html = replaced.replace(/<\/head>/i, `${styleTag}\n</head>`);
    } else if (/<html[\s>]/i.test(replaced) || /^<!doctype/i.test(replaced.trim())) {
        html = replaced.replace(
            /<html([^>]*)>/i,
            `<html$1><head>${styleTag}</head>`
        );
    } else {
        /*
         * 纯文本经正则处理后可能变成 HTML 片段，
         * 片段需要包一层文档，并保留换行。
         */
        let body;

        if (isHtml || regexChanged) {
            body = replaced;
        } else if (formatPlain) {
            body = formatTutuPlainHtml(replaced);
        } else {
            body = escapeHtml(replaced);
        }

        html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { margin: 0; padding: 12px; white-space: pre-wrap; word-break: break-word; font-family: inherit; }
</style>
${styleTag}
</head>
<body class="tutu-render-body${formatPlain ? ' tutu-typo-formatted' : ''}">${body}${formatPlain ? TUTU_IFRAME_DBLCLICK_SCRIPT : ''}</body>
</html>`;
    }

    return html;
}

// ==========================================
// 内置防截断
// ==========================================

/**
 * 防截断 CSS：放在文档最末尾，优先级最高。
 * 只解除 html / body 的固定高度和隐藏溢出，不动内部元素的布局。
 */
const TUTU_ANTI_CLIP_CSS = `html, body {
    height: auto !important;
    max-height: none !important;
    overflow-y: visible !important;
}
html { overflow-x: hidden !important; }
body { overflow-x: auto !important; }`;

function isTutuAntiClipActive() {
    return tutuSettings.renderAntiClip !== false;
}

/**
 * 需要自动高度时（防截断或一键自适应）注入高度上报脚本，
 * 防截断开启时再追加防截断 CSS。
 */
function injectTutuAntiClip(html) {
    const antiClip = isTutuAntiClipActive();

    if (!antiClip && !isTutuAutoFitActive()) {
        return html;
    }

    let result = injectTutuAutoHeightScript(html);

    if (antiClip) {
        const style = `<style id="tutu-anti-clip">\n${TUTU_ANTI_CLIP_CSS}\n</style>`;

        result = /<\/body>/i.test(result)
            ? result.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${style}\n</body>`)
            : `${result}\n${style}`;
    }

    return result;
}

// ==========================================
// 内置排版美化：字号 / 行距 / 字体 / 颜色 / 背景
// ==========================================

const TUTU_FONT_PRESETS = {
    inherit: '',
    serif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif',
    sans: '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    kai: '"LXGW WenKai", "KaiTi", "STKaiti", "Kaiti SC", serif',
    fangsong: '"FangSong", "STFangsong", "FangSong_GB2312", serif',
    round: '"Yuanti SC", "YouYuan", "Varela Round", sans-serif',
    mono: '"JetBrains Mono", "Cascadia Code", "Consolas", "Noto Sans Mono CJK SC", monospace',
};

function getDefaultTutuTypography() {
    return {
        enabled: false,
        fontSize: 15,
        lineHeight: 1.8,
        fontPreset: 'inherit',
        fontFamily: '',
        fontUrl: '',
        textColor: '',
        bgColor: '',
        bgImage: '',
        padding: 14,
        // 段落与版式
        paddingX: 18,           // 左右边距（px）
        letterSpacing: 0,       // 字间距（px）
        paragraphSpacing: 0.6,  // 段间距（em）
        textIndent: 0,          // 首行缩进（字）
        maxWidth: 0,            // 整体宽度（px），0 = 不限
        // 效果开关
        quoteHighlight: false,  // 引号高亮
        quoteColor: '#c96f4a',
        dropCap: false,         // 首字放大
        chatBubble: true,       // 微信聊天自动渲染成气泡
        dialogueBlock: false,   // 对话改成「名字 ▌ / 换行台词」
    };
}

/** 数值设置的取值范围与默认值 */
const TUTU_TYPO_NUMBER_RANGES = {
    fontSize: [10, 40, 15],
    lineHeight: [1, 3, 1.8],
    padding: [0, 60, 14],
    paddingX: [0, 80, 18],
    letterSpacing: [-1, 8, 0],
    paragraphSpacing: [0, 3, 0.6],
    textIndent: [0, 4, 0],
    maxWidth: [0, 2000, 0],
};

/** 去掉可能跳出 CSS 声明的字符 */
function sanitizeTutuCssValue(value) {
    return String(value || '')
        .replace(/[<>{};\\]/g, '')
        .replace(/\/\*|\*\//g, '')
        .trim()
        .slice(0, 300);
}

/** 只允许 http(s) / data / 相对路径，并转义引号括号 */
function sanitizeTutuCssUrl(value) {
    const url = String(value || '').trim();

    if (!url) return '';
    if (!/^(https?:\/\/|data:|\/|\.\/)/i.test(url)) return '';

    return url
        .replace(/[\s<>{}\\]/g, '')
        .replace(/["'()]/g, char => encodeURIComponent(char))
        .slice(0, 2000);
}

/** 用户写的字体名：单个名字自动加引号，多个（逗号分隔）按原样 */
function normalizeTutuFontFamily(value) {
    const name = sanitizeTutuCssValue(value);

    if (!name) return '';
    if (name.includes(',') || /["']/.test(name)) return name;

    return `"${name}"`;
}

function getTutuTypographyState() {
    const typo = {
        ...getDefaultTutuTypography(),
        ...(tutuSettings.typography || {}),
    };

    Object.entries(TUTU_TYPO_NUMBER_RANGES).forEach(([key, [min, max, fallback]]) => {
        const value = Number(typo[key]);

        typo[key] = Number.isFinite(value)
            ? Math.min(Math.max(value, min), max)
            : fallback;
    });

    return typo;
}

/** 返回 { fontFace, family }，fontFace 是 @import / @font-face 语句 */
function getTutuTypographyFont(typo) {
    const fontUrl = sanitizeTutuCssUrl(typo.fontUrl);
    const customName =
        normalizeTutuFontFamily(typo.fontFamily) ||
        (fontUrl ? '"TutuCustomFont"' : '');

    let fontFace = '';

    if (fontUrl) {
        const isFontFile = /\.(woff2?|ttf|otf)(\?|#|$)/i.test(fontUrl) ||
            /^data:font\//i.test(fontUrl);

        fontFace = isFontFile
            ? `@font-face { font-family: ${customName}; src: url("${fontUrl}"); font-display: swap; }`
            : `@import url("${fontUrl}");`;
    }

    let family = '';

    if (typo.fontPreset === 'custom') {
        family = customName;
    } else if (TUTU_FONT_PRESETS[typo.fontPreset]) {
        family = TUTU_FONT_PRESETS[typo.fontPreset];
    }

    // 预设字体 + 自定义字体名同时存在时，自定义字体优先
    if (customName && typo.fontPreset !== 'custom' && typo.fontPreset !== 'inherit') {
        family = `${customName}, ${family}`;
    }

    return { fontFace, family };
}

/**
 * 生成排版声明。
 * withBackground：是否包含背景和内边距（HTML 文档不改背景）。
 */
function buildTutuTypographyDeclarations(typo, family, withBackground, important) {
    const imp = important ? ' !important' : '';
    const rules = [
        `font-size: ${typo.fontSize}px${imp}`,
        `line-height: ${typo.lineHeight}${imp}`,
    ];

    if (family) rules.push(`font-family: ${family}${imp}`);

    const textColor = sanitizeTutuCssValue(typo.textColor);
    if (textColor) rules.push(`color: ${textColor}${imp}`);

    if (withBackground) {
        const bgColor = sanitizeTutuCssValue(typo.bgColor);
        const bgImage = sanitizeTutuCssUrl(typo.bgImage);

        if (bgColor) rules.push(`background-color: ${bgColor}${imp}`);

        if (bgImage) {
            rules.push(`background-image: url("${bgImage}")${imp}`);
            rules.push(`background-size: cover${imp}`);
            rules.push(`background-position: center${imp}`);
            rules.push(`background-repeat: no-repeat${imp}`);
        }

        // 上下内边距 + 左右边距
        rules.push(`padding: ${typo.padding}px ${typo.paddingX}px${imp}`);
    }

    if (typo.letterSpacing) {
        rules.push(`letter-spacing: ${typo.letterSpacing}px${imp}`);
    }

    // 整体宽度：限制最大宽度并居中
    if (typo.maxWidth > 0) {
        rules.push(`max-width: ${typo.maxWidth}px${imp}`);
        rules.push(`margin-left: auto${imp}`);
        rules.push(`margin-right: auto${imp}`);
    }

    return rules.join(';\n    ');
}

// ==========================================
// 纯文本结构化排版：段落 / 首字放大 / 引号高亮 / 微信气泡 / 对话块
// ==========================================

/** 成对引号：中文双引号、单引号、直角引号、英文双引号 */
const TUTU_QUOTE_PATTERN = /(“[^“”\n]*”|‘[^‘’\n]*’|「[^「」\n]*」|『[^『』\n]*』|"[^"\n]*")/g;

/** 「名字：台词」，名字 1–12 个字，不含标点和空白 */
const TUTU_DIALOGUE_LINE = /^\s*[【\[]?([^\s:：，。！？、,.!?“”"「」【】\[\]()（）<>《》]{1,12})[】\]]?\s*[:：]\s*(\S.*)$/;

/** 名字以「说 / 道 / 问」等结尾时多半是叙述（他说：“……”），不当成对话行 */
const TUTU_NARRATIVE_SPEAKER = /(说|道|问|答|喊|叫|笑|骂|吼|想|写|念|唱|哭|叹|嘟囔|回复|表示|开口)$/;

/** 单独一行的时间：10:23、下午 3:05、2026-10-27 08:00 */
const TUTU_TIME_LINE = /^\s*[\[【(（]?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s*)?((上午|下午|晚上|凌晨|中午|早上|昨天|今天|星期.|周.)\s*)?\d{1,2}[:：]\d{2}(:\d{2})?\s*[\]】)）]?\s*$/;

/** 单独一行的系统提示：[对方撤回了一条消息]、—— 以下是新消息 —— */
const TUTU_SYSTEM_LINE = /^\s*([\[【（(][^\]】）)]{1,30}[\]】）)]|[—\-=·]{2,}.{0,30}[—\-=·]{2,})\s*$/;

/** 聊天软件信号 */
const TUTU_CHAT_KEYWORDS = /(微信|聊天记录|聊天界面|群聊|私聊|QQ|短信|消息记录|朋友圈|对话框)/i;
const TUTU_CHAT_MEDIA = /\[(语音|图片|表情|表情包|转账|红包|撤回|视频|位置|文件|拍了拍|动画表情)[^\]]*\]/;

function getTutuSelfNames() {
    const names = new Set(['我', '自己', '{{user}}', 'user', 'me']);

    try {
        const name1 = String(SillyTavern.getContext()?.name1 || '').trim();
        if (name1) names.add(name1);
    } catch (error) {
        // 非酒馆环境（测试）忽略
    }

    return names;
}

function getTutuCharNameForChat() {
    try {
        return String(SillyTavern.getContext()?.name2 || '').trim();
    } catch (error) {
        return '';
    }
}

/**
 * 转义 + 引号处理：
 * - emph 为真（开了对话排版）：叙述里的引号是强调，用「强调标签」样式，和台词气泡区分
 * - 否则开了引号高亮时只改颜色
 */
function formatTutuInlineText(text, typo, emph = false) {
    const raw = String(text || '');

    if (!emph && !typo.quoteHighlight) return escapeHtml(raw);

    return raw
        .split(TUTU_QUOTE_PATTERN)
        .map((part, index) => {
            if (index % 2 === 0) return escapeHtml(part);

            if (emph) {
                const open = escapeHtml(part.charAt(0));
                const close = escapeHtml(part.slice(-1));
                const inner = escapeHtml(part.slice(1, -1));

                return `<span class="tutu-emph"><span class="tutu-emph-mark">${open}</span>${inner}<span class="tutu-emph-mark">${close}</span></span>`;
            }

            return `<span class="tutu-typo-quote">${escapeHtml(part)}</span>`;
        })
        .join('');
}

// ==========================================
// 对话气泡手动修正：按内容保存每一行的说话人 / 样式
// ==========================================

const TUTU_DIALOGUE_OVERRIDES_KEY = 'tutu_theater_dialogue_overrides';
const TUTU_DIALOGUE_OVERRIDES_LIMIT = 200;

/** 行样式：speech 台词气泡 / chat 聊天气泡 / emph 普通引用（强调） / plain 普通段落 */
const TUTU_LINE_MODES = ['speech', 'chat', 'emph', 'plain'];

/** 统一换行并去掉首尾空白：指纹和行号都按这个版本算，保证双击的行号和保存的行号一致 */
function normalizeTutuPlainSource(text) {
    return String(text || '').replace(/\r\n?/g, '\n').trim();
}

/** 内容指纹（FNV-1a），同一段文字在面板、楼层、收藏里都能对上 */
function hashTutuText(text) {
    const value = normalizeTutuPlainSource(text);
    let hash = 0x811c9dc5;

    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    return `${hash.toString(36)}_${value.length.toString(36)}`;
}

let tutuDialogueOverrides = (() => {
    try {
        const data = JSON.parse(localStorage.getItem(TUTU_DIALOGUE_OVERRIDES_KEY) || '{}');
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (error) {
        return {};
    }
})();

/** 清洗单行修正：只留合法的 mode 和 1–12 字的名字 */
function sanitizeTutuLineOverride(value) {
    if (!value || typeof value !== 'object') return null;

    const result = {};

    if (TUTU_LINE_MODES.includes(value.mode)) result.mode = value.mode;

    const name = String(value.name || '').replace(/[\r\n<>]/g, '').trim().slice(0, 12);
    if (name) result.name = name;

    return Object.keys(result).length ? result : null;
}

/**
 * 渲染过的原文登记：双击某个块时按 data-tutu-src 找回原文。
 * 只存在内存里，最多记 300 段。
 */
const tutuRenderedSources = new Map();

function registerTutuRenderedSource(text) {
    const key = hashTutuText(text);

    tutuRenderedSources.delete(key);
    tutuRenderedSources.set(key, normalizeTutuPlainSource(text));

    while (tutuRenderedSources.size > 300) {
        tutuRenderedSources.delete(tutuRenderedSources.keys().next().value);
    }

    return key;
}

/** 读取某段内容的修正：{ 行号: { mode, name } } */
function getTutuDialogueOverrides(text) {
    const entry = tutuDialogueOverrides[hashTutuText(text)];

    return entry && entry.lines && typeof entry.lines === 'object' ? entry.lines : {};
}

function saveTutuDialogueOverrides(text, lines) {
    const key = hashTutuText(text);
    const clean = {};

    Object.entries(lines || {}).forEach(([index, value]) => {
        const item = sanitizeTutuLineOverride(value);
        if (item && /^\d+$/.test(index)) clean[index] = item;
    });

    if (Object.keys(clean).length) {
        tutuDialogueOverrides[key] = { lines: clean, updatedAt: Date.now() };
    } else {
        delete tutuDialogueOverrides[key];
    }

    // 超出上限时删掉最久没改的
    const keys = Object.keys(tutuDialogueOverrides);

    if (keys.length > TUTU_DIALOGUE_OVERRIDES_LIMIT) {
        keys
            .sort((a, b) => (tutuDialogueOverrides[a]?.updatedAt || 0) - (tutuDialogueOverrides[b]?.updatedAt || 0))
            .slice(0, keys.length - TUTU_DIALOGUE_OVERRIDES_LIMIT)
            .forEach(item => delete tutuDialogueOverrides[item]);
    }

    try {
        localStorage.setItem(TUTU_DIALOGUE_OVERRIDES_KEY, JSON.stringify(tutuDialogueOverrides));
    } catch (error) {
        console.warn('[克制放映室] 保存气泡修正失败：', error);
    }
}

function parseTutuDialogueLine(line) {
    const match = String(line || '').match(TUTU_DIALOGUE_LINE);

    if (!match) return null;

    const name = match[1].trim();

    if (TUTU_NARRATIVE_SPEAKER.test(name) || /^\d+$/.test(name)) return null;

    // 「欲宓皱眉：“……”」冒号后是引号 → 叙述 + 台词，交给叙述行处理
    if (/^[“「『"]/.test(match[2].trim())) return null;

    return { name, text: match[2].trim() };
}

// ---------- 叙述里嵌着引号台词：欲宓……皱眉偏了偏头：“……” ----------

/** 台词引号（不含单引号，单引号多用于强调） */
const TUTU_SPEECH_QUOTE = /(“[^“”]*”|「[^「」]*」|『[^『』]*』|"[^"\n]*")/g;

/** 代词说话人 */
const TUTU_PRONOUN_SPEAKER = /^(他|她|它|我|你|您|他们|她们|我们|你们)/;

/** 不能当名字开头的叙述词 */
const TUTU_NAME_STOPWORDS = /^(这时|此时|然后|于是|接着|随后|忽然|突然|终于|最后|只是|但是|可是|不过|因为|所以|如果|虽然|那边|这边|一旁|旁边|门外|屋里|对面|身后|半晌|片刻|良久|许久|一会|下一秒|话音|声音)/;

/** 名字里不该出现的字：说明截到了动作 */
const TUTU_NAME_BAD_CHAR = /[他她它你我的了着被把将在是这那和与跟向对给让从又也都就还很不没]/;

/**
 * 判断引号里是不是台词：
 * 太短（≤4 字）且前面不是冒号 / 后面不是「说 / 道」时，多半是强调词，不当台词。
 */
function isTutuSpeechQuote(quote, before, after) {
    const inner = quote.slice(1, -1).trim();

    if (!inner) return false;
    if (/[:：，,]\s*$/.test(before)) return true;
    if (/^\s*[，,]?\s*(他|她|它)?(说|道|问|答|喊|叫|笑道|骂道|低声|轻声)/.test(after)) return true;
    if (!before.trim()) return true;     // 行首直接是引号
    if (/[。！？!?…~～]$/.test(inner)) return true;

    return Array.from(inner).length > 4;
}

/** 把一行拆成 [{ type:'narration'|'speech', text }] */
function splitTutuSpeechSegments(line) {
    const segments = [];
    const text = String(line || '');
    let last = 0;
    let match;

    TUTU_SPEECH_QUOTE.lastIndex = 0;

    while ((match = TUTU_SPEECH_QUOTE.exec(text))) {
        const before = text.slice(last, match.index);
        const after = text.slice(match.index + match[0].length);

        if (!isTutuSpeechQuote(match[0], text.slice(0, match.index), after)) continue;

        if (before) segments.push({ type: 'narration', text: before });
        segments.push({ type: 'speech', text: match[0].slice(1, -1).trim(), quote: match[0] });
        last = match.index + match[0].length;
    }

    if (last < text.length) segments.push({ type: 'narration', text: text.slice(last) });

    return segments;
}

/** 从叙述开头猜名字：取到第一个动作字 / 标点前，2–4 字 */
function guessTutuSpeakerName(narration) {
    const head = String(narration || '').replace(/^[\s\u3000]+/, '');

    if (TUTU_NAME_STOPWORDS.test(head)) return '';

    // 名字后面紧跟介词 / 副词 / 常见动作字，或标点
    const match = head.match(/^([\u4e00-\u9fa5·]{2,4}?)(?=[被把将在对向跟和与给让从又也都就还刚才正已便却只再看抬低笑皱偏点摇说道问伸走转望拿握靠坐站叹轻冷挑眯垂咬撇勾揉听愣盯瞥]|[，,。：:！？\s])/);

    if (!match) return '';

    const name = match[1];

    if (TUTU_NAME_BAD_CHAR.test(name) || TUTU_PRONOUN_SPEAKER.test(name)) return '';

    return name;
}

/**
 * 找说话人：
 * 1. 叙述开头就是已知名字（角色 / 用户 / 「名字：」行出现过的）
 * 2. 叙述开头是代词 → 用代词当颜色分组，不显示名字
 * 3. 从叙述开头猜一个名字
 */
function findTutuSpeaker(narration, knownNames) {
    const head = String(narration || '').replace(/^[\s\u3000]+/, '');

    if (!head) return null;

    const known = knownNames.find(name => head.startsWith(name));
    if (known) return { name: known, key: known };

    const pronoun = head.match(TUTU_PRONOUN_SPEAKER);
    if (pronoun) return { name: '', key: `pronoun:${pronoun[1]}` };

    // 叙述中间带已知名字 + 冒号（「……这时欲宓开口：」）
    const tail = head.slice(-24);
    const tailKnown = knownNames.find(name => tail.includes(name) && /[:：]\s*$/.test(head));
    if (tailKnown) return { name: tailKnown, key: tailKnown };

    const guessed = guessTutuSpeakerName(head);
    if (guessed) return { name: guessed, key: guessed };

    return null;
}

function collectTutuKnownSpeakerNames(tokens) {
    const names = new Set();

    try {
        const ctx = SillyTavern.getContext();
        [ctx?.name1, ctx?.name2].forEach(name => {
            const value = String(name || '').trim();
            if (value && value.length <= 12) names.add(value);
        });
    } catch (error) {
        // 非酒馆环境忽略
    }

    tokens.forEach(token => {
        if (token.type === 'dialogue') names.add(token.name);
    });

    // 长名字优先匹配
    return [...names].sort((a, b) => b.length - a.length);
}

/**
 * 行分类。override 是手动修正：
 * - mode=emph / plain：不再当成「名字：台词」，按普通行处理
 * - name：替换识别出的说话人
 */
function classifyTutuPlainLine(line, override = null) {
    if (!String(line).trim()) return { type: 'blank' };

    const mode = override?.mode || '';
    const forcedName = override?.name || '';

    if (mode === 'emph' || mode === 'plain') {
        return { type: 'text', text: line, mode, forcedName };
    }

    if (TUTU_TIME_LINE.test(line)) return { type: 'time', text: line.trim() };

    // 手动标成聊天气泡：任何行都当成一条聊天消息
    if (mode === 'chat') {
        const strict = parseTutuDialogueLine(line);
        const loose = String(line).match(/^\s*([^：:\n]{1,12}?)\s*[：:]\s*(.+)$/);
        let name = strict?.name || '';
        let message = strict?.text || '';

        if (!strict && loose && !TUTU_NARRATIVE_SPEAKER.test(loose[1].trim())) {
            name = loose[1].trim();
            message = loose[2].trim();
        }

        if (!message) {
            // 「欲宓皱眉：“……”」/ 纯叙述：取引号里的话当消息，开头猜名字
            const quotes = String(line).match(TUTU_SPEECH_QUOTE);
            message = quotes
                ? quotes.map(item => item.slice(1, -1).trim()).join(' ')
                : String(line).trim();
            name = guessTutuSpeakerName(line) || '';
        }

        // 引号包着的消息去掉引号
        message = message.replace(/^[“「『"](.*)[”」』"]$/, '$1').trim() || String(line).trim();

        return {
            type: 'dialogue',
            name: forcedName || name,
            originalName: name,
            text: message,
            mode,
        };
    }

    const dialogue = parseTutuDialogueLine(line);
    if (dialogue) {
        return {
            type: 'dialogue',
            ...dialogue,
            name: forcedName || dialogue.name,
            originalName: dialogue.name,
            mode,
        };
    }

    if (TUTU_SYSTEM_LINE.test(line)) return { type: 'system', text: line.trim() };

    return { type: 'text', text: line, mode, forcedName };
}

/**
 * 决定聊天气泡里哪个说话人在右边（自己）：
 * 1. 名字是 我 / {{user}} / 用户名
 * 2. 只有两个人且其中一个是当前角色 → 另一个在右边
 */
function pickTutuChatSelf(speakers) {
    const selfNames = getTutuSelfNames();
    const self = speakers.find(name => selfNames.has(name));

    if (self) return self;

    const charName = getTutuCharNameForChat();

    if (speakers.length === 2 && charName && speakers.includes(charName)) {
        return speakers.find(name => name !== charName);
    }

    return '';
}

function renderTutuChatRun(tokens, typo, srcKey = '') {
    const speakers = [...new Set(
        tokens.filter(token => token.type === 'dialogue').map(token => token.name)
    )];
    const self = pickTutuChatSelf(speakers);
    const attr = token => (
        srcKey && Number.isInteger(token.line)
            ? ` data-tutu-src="${srcKey}" data-tutu-line="${token.line}"`
            : ''
    );

    const rows = tokens.map(token => {
        if (token.type === 'time' || token.type === 'system') {
            return `<div class="tutu-chat-tip"${attr(token)}>${escapeHtml(token.text.replace(/^[\[【（(]|[\]】）)]$/g, ''))}</div>`;
        }

        const isSelf = token.name === self;
        const avatar = escapeHtml(Array.from(token.name)[0] || '?');

        return `<div class="tutu-chat-row${isSelf ? ' self' : ''}"${attr(token)}>`
            + `<div class="tutu-chat-avatar" aria-hidden="true">${avatar}</div>`
            + '<div class="tutu-chat-main">'
            + `<div class="tutu-chat-name">${escapeHtml(token.name)}</div>`
            + `<div class="tutu-chat-bubble">${escapeHtml(token.text)}</div>`
            + '</div></div>';
    });

    return `<div class="tutu-chat">${rows.join('')}</div>`;
}

/**
 * 纯文本 → 结构化 HTML（全部转义，安全）：
 * - 每个非空行一个段落，第一个段落可首字放大
 * - 连续的「名字：台词」+ 时间 / 系统提示，且有聊天信号时 → 微信气泡
 * - 其余对话行在开启对话块时 → 名字 ▌ / 换行台词
 */
/**
 * options.overrides：手动修正 { 行号: { mode, name } }，不传时按内容指纹读取已保存的修正
 * 每个块都带 data-tutu-src（原文指纹）和 data-tutu-line（行号），双击修正时用
 */
function formatTutuPlainHtml(text, typo = getTutuTypographyState(), options = {}) {
    const source = normalizeTutuPlainSource(text);
    const lines = source.split('\n');
    const overrides = options.overrides || getTutuDialogueOverrides(source);
    const srcKey = registerTutuRenderedSource(source);
    const tokens = lines.map((line, lineIndex) => ({
        ...classifyTutuPlainLine(line, overrides[lineIndex] || null),
        line: lineIndex,
    }));
    const html = [];
    let firstParagraphDone = false;
    let index = 0;

    const lineAttr = token => (token ? ` data-tutu-src="${srcKey}" data-tutu-line="${token.line}"` : '');

    // 当前正在渲染的行，供各渲染函数加行号
    let currentToken = null;

    const renderParagraph = (value, emph = false) => {
        const content = formatTutuInlineText(String(value).replace(/^[\s\u3000]+/, ''), typo, emph);
        const cls = !firstParagraphDone ? 'tutu-typo-p tutu-typo-first' : 'tutu-typo-p';

        firstParagraphDone = true;
        return `<p class="${cls}"${lineAttr(currentToken)}>${content}</p>`;
    };

    // ---------- 对话块：按说话人分配颜色 ----------
    const knownNames = collectTutuKnownSpeakerNames(tokens);
    const speakerColors = new Map();
    const recentSpeakers = [];   // 最近两个不同的说话人，用于推断没写名字的台词

    const getSpeakerColor = key => {
        if (!speakerColors.has(key)) speakerColors.set(key, speakerColors.size % 6);
        return speakerColors.get(key);
    };

    const rememberSpeaker = speaker => {
        if (!speaker || speaker.key === 'unknown') return;
        if (recentSpeakers[0]?.key === speaker.key) return;

        recentSpeakers.unshift(speaker);
        recentSpeakers.length = Math.min(recentSpeakers.length, 2);
    };

    /** 没有叙述的纯台词行：两人轮流说话时归给另一个人 */
    const inferSpeaker = () => (
        recentSpeakers.length === 2
            ? recentSpeakers[1]
            : { name: '', key: 'unknown' }
    );

    const buildDialogueBlock = (speaker, parts) => {
        firstParagraphDone = true;

        const color = getSpeakerColor(speaker.key);
        const nameHtml = speaker.name
            ? `<div class="tutu-dialogue-name">${escapeHtml(speaker.name)}</div>`
            : '';

        const body = parts.map(part => {
            if (part.type === 'speech') {
                return `<div class="tutu-dialogue-bubble">${escapeHtml(part.text)}</div>`;
            }

            // 叙述去掉开头重复的名字和结尾的冒号
            let narration = part.text.replace(/^[\s\u3000]+/, '');
            if (speaker.name && narration.startsWith(speaker.name) && part === parts[0]) {
                narration = narration.slice(speaker.name.length);
            }
            narration = narration.replace(/[:：，,\s]+$/, '').replace(/^[，,\s]+/, '');

            if (!narration || /^[。！？!?…~～、\s]+$/.test(narration)) return '';

            // 叙述里没被当成台词的引号是强调，换成强调样式
            return `<div class="tutu-dialogue-action">${formatTutuInlineText(narration, typo, true)}</div>`;
        }).join('');

        return `<div class="tutu-dialogue tutu-speaker-${color}"${lineAttr(currentToken)}>${nameHtml}${body}</div>`;
    };

    const renderDialogue = token => {
        // 手动标成台词的行即使没开「对话排版」也出气泡
        if (!typo.dialogueBlock && token.mode !== 'speech') {
            return renderParagraph(`${token.name}：${token.text}`);
        }

        const speaker = { name: token.name, key: token.name };
        rememberSpeaker(speaker);

        return buildDialogueBlock(speaker, [{ type: 'speech', text: token.text }]);
    };

    /** 识别出的说话人被手动改名时：叙述开头的旧名字也要去掉 */
    const applyForcedName = (speaker, forcedName) => {
        if (!forcedName) return speaker;

        return { name: forcedName, key: forcedName, replaced: speaker?.name || '' };
    };

    /** 普通叙述行：开启对话排版且含台词引号时，渲染成对话块 */
    const renderTextLine = token => {
        const line = token.text;
        const mode = token.mode || '';

        // 手动取消气泡：原样段落（引号按普通高亮）
        if (mode === 'plain') return renderParagraph(line);

        // 手动标成普通引用：所有引号都是强调样式，不出气泡
        if (mode === 'emph') return renderParagraph(line, true);

        // 没开「对话排版」时只有手动标成台词的行出气泡
        if (!typo.dialogueBlock && mode !== 'speech') return renderParagraph(line);

        let parts;

        if (mode === 'speech') {
            // 手动标成台词：所有台词引号都算台词；整行没引号就整行当台词
            parts = [];
            let last = 0;
            let match;

            TUTU_SPEECH_QUOTE.lastIndex = 0;

            while ((match = TUTU_SPEECH_QUOTE.exec(line))) {
                if (match.index > last) parts.push({ type: 'narration', text: line.slice(last, match.index) });
                parts.push({ type: 'speech', text: match[0].slice(1, -1).trim(), quote: match[0] });
                last = match.index + match[0].length;
            }

            if (last < line.length) parts.push({ type: 'narration', text: line.slice(last) });

            if (!parts.some(part => part.type === 'speech')) {
                parts = [{ type: 'speech', text: line.trim() }];
            }
        } else {
            parts = splitTutuSpeechSegments(line);

            // 没有台词：引号都是强调
            if (!parts.some(part => part.type === 'speech')) return renderParagraph(line, true);
        }

        const firstNarration = parts[0].type === 'narration' ? parts[0].text : '';
        const lastNarration = parts[parts.length - 1].type === 'narration'
            ? parts[parts.length - 1].text
            : '';

        let speaker = findTutuSpeaker(firstNarration, knownNames)
            || findTutuSpeaker(lastNarration.replace(/^[，,\s]+/, ''), knownNames)
            || inferSpeaker();

        speaker = applyForcedName(speaker, token.forcedName);

        // 改名后叙述开头还留着识别错的名字（如「欲宓抬眼」被识别成「欲宓抬」），一起去掉
        if (speaker.replaced && parts[0].type === 'narration') {
            const head = parts[0].text.replace(/^[\s\u3000]+/, '');

            if (head.startsWith(speaker.replaced) && !head.startsWith(speaker.name)) {
                parts = [{ ...parts[0], text: head.slice(speaker.replaced.length) }, ...parts.slice(1)];
            }
        }

        rememberSpeaker(speaker);

        return buildDialogueBlock(speaker, parts);
    };

    // 手动标成台词气泡的「名字：」行不进微信聊天
    const isChatToken = item => (
        ['time', 'system', 'blank'].includes(item.type) ||
        (item.type === 'dialogue' && item.mode !== 'speech')
    );
    const isForcedChat = item => item.type === 'dialogue' && item.mode === 'chat';

    while (index < tokens.length) {
        const token = tokens[index];
        currentToken = token;

        // 收集一段连续的聊天行（允许中间夹空行）；手动标成聊天气泡的行即使没开「微信气泡」也收集
        if ((typo.chatBubble || isForcedChat(token)) && token.type !== 'blank' && isChatToken(token)) {
            let end = index;
            let lastContent = index;

            while (end < tokens.length && isChatToken(tokens[end])) {
                if (tokens[end].type !== 'blank') lastContent = end;
                end++;
            }

            const run = tokens.slice(index, lastContent + 1).filter(item => item.type !== 'blank');
            const dialogues = run.filter(item => item.type === 'dialogue');
            const nearby = lines.slice(Math.max(0, index - 2), index).join('\n');
            const isChat = dialogues.some(isForcedChat) || (typo.chatBubble && dialogues.length >= 2 && (
                run.some(item => item.type === 'time') ||
                dialogues.some(item => TUTU_CHAT_MEDIA.test(item.text)) ||
                TUTU_CHAT_KEYWORDS.test(nearby)
            ));

            if (isChat) {
                html.push(renderTutuChatRun(run, typo, srcKey));
                firstParagraphDone = true;
                index = lastContent + 1;
                continue;
            }
        }

        if (token.type === 'dialogue') {
            html.push(renderDialogue(token));
        } else if (token.type !== 'blank') {
            html.push(token.type === 'text' ? renderTextLine(token) : renderParagraph(token.text));
        }

        index++;
    }

    return html.join('');
}

/** 结构化排版是否生效（启用排版即生效） */
function isTutuTypographyFormatActive() {
    return Boolean(getTutuTypographyState().enabled);
}

/**
 * 把纯文本填进元素：启用排版时结构化渲染，否则 textContent 原样显示。
 */
function fillTutuPlainText(element, text) {
    if (!element) return;

    element.classList.add('tutu-typo-plain');

    if (isTutuTypographyFormatActive()) {
        element.innerHTML = formatTutuPlainHtml(text);
        element.classList.add('tutu-typo-formatted');
    } else {
        element.textContent = String(text || '');
        element.classList.remove('tutu-typo-formatted');
    }
}

/**
 * 结构化排版的 CSS。
 * scope：段落容器选择器；iframe 里是 body，页面上是 .tutu-typo-formatted。
 */
function buildTutuTypographyStructureCss(typo, scope) {
    const quoteColor = sanitizeTutuCssValue(typo.quoteColor) || '#c96f4a';
    const s = scope;

    return `
${s} .tutu-typo-p {
    margin: 0 0 ${typo.paragraphSpacing}em !important;
    text-indent: ${typo.textIndent}em !important;
}
${s} .tutu-typo-p:last-child { margin-bottom: 0 !important; }
${typo.dropCap ? `
${s} .tutu-typo-first { text-indent: 0 !important; }
${s} .tutu-typo-first::first-letter {
    float: left;
    font-size: 2.6em;
    line-height: 1;
    font-weight: 700;
    margin: 0.06em 0.12em 0 0;
    color: ${quoteColor};
}` : ''}
${s} .tutu-typo-quote { color: ${quoteColor} !important; }

${s} .tutu-dialogue {
    --tutu-sp: #c96f4a;
    --tutu-sp-bg: rgba(201, 111, 74, 0.12);
    margin: 0 0 ${Math.max(typo.paragraphSpacing, 0.9)}em;
    text-indent: 0;
}
${s} .tutu-dialogue + .tutu-dialogue { margin-top: 0.3em; }
${s} .tutu-speaker-1 { --tutu-sp: #4a8fc9; --tutu-sp-bg: rgba(74, 143, 201, 0.12); }
${s} .tutu-speaker-2 { --tutu-sp: #5aa469; --tutu-sp-bg: rgba(90, 164, 105, 0.12); }
${s} .tutu-speaker-3 { --tutu-sp: #a46ac9; --tutu-sp-bg: rgba(164, 106, 201, 0.12); }
${s} .tutu-speaker-4 { --tutu-sp: #c9a24a; --tutu-sp-bg: rgba(201, 162, 74, 0.14); }
${s} .tutu-speaker-5 { --tutu-sp: #c94a7a; --tutu-sp-bg: rgba(201, 74, 122, 0.12); }
${s} .tutu-dialogue-name {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-weight: 700;
    font-size: 0.92em;
    color: var(--tutu-sp);
}
${s} .tutu-dialogue-name::after {
    content: "";
    flex: 0 0 4px;
    width: 4px;
    height: 1.05em;
    border-radius: 2px;
    background: currentColor;
}

/* 强调引号：不是台词，用虚线下划 + 浅底的行内标签，和左边粗线的台词气泡区分 */
${s} .tutu-emph {
    padding: 0 0.15em;
    border-radius: 3px;
    border-bottom: 1.5px dashed ${quoteColor};
    background: color-mix(in srgb, ${quoteColor} 10%, transparent);
    color: inherit;
    font-weight: 600;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
}
${s} .tutu-emph-mark {
    color: ${quoteColor};
    opacity: 0.7;
    font-weight: 400;
}
${s} .tutu-dialogue-action {
    margin-top: 0.2em;
    font-size: 0.92em;
    opacity: 0.78;
}
${s} .tutu-dialogue-bubble {
    width: fit-content;
    max-width: 100%;
    box-sizing: border-box;
    margin-top: 0.35em;
    padding: 0.4em 0.8em;
    border-left: 3px solid var(--tutu-sp);
    border-radius: 4px 10px 10px 4px;
    background: var(--tutu-sp-bg);
    word-break: break-word;
}
${s} .tutu-dialogue-bubble + .tutu-dialogue-bubble { margin-top: 0.5em; }

${s} .tutu-chat {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0.6em 0 ${Math.max(typo.paragraphSpacing, 0.6)}em;
    padding: 12px 10px;
    border-radius: 10px;
    background: rgba(127, 127, 127, 0.08);
    text-indent: 0;
    letter-spacing: normal;
}
${s} .tutu-chat-tip {
    align-self: center;
    font-size: 0.75em;
    opacity: 0.6;
    padding: 1px 8px;
    border-radius: 4px;
    background: rgba(127, 127, 127, 0.12);
}
${s} .tutu-chat-row { display: flex; align-items: flex-start; gap: 8px; }
${s} .tutu-chat-row.self { flex-direction: row-reverse; }
${s} .tutu-chat-avatar {
    flex: 0 0 34px;
    width: 34px;
    height: 34px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    background: #8a9bb0;
}
${s} .tutu-chat-row.self .tutu-chat-avatar { background: #6aa36f; }
${s} .tutu-chat-main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 72%;
    min-width: 0;
}
${s} .tutu-chat-row.self .tutu-chat-main { align-items: flex-end; }
${s} .tutu-chat-name { font-size: 0.72em; opacity: 0.6; margin: 0 2px 2px; }
${s} .tutu-chat-bubble {
    position: relative;
    padding: 7px 11px;
    border-radius: 6px;
    font-size: 0.95em;
    line-height: 1.55;
    color: #222;
    background: #fff;
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.06);
    word-break: break-word;
    white-space: pre-wrap;
}
${s} .tutu-chat-row.self .tutu-chat-bubble { background: #95ec69; }
`;
}

/**
 * 纯文本小剧场进入 iframe（开了渲染 CSS / 正则）时的排版 CSS。
 * 使用 !important，避免被渲染 CSS、一键自适应覆盖。
 */
function buildTutuTypographyIframeCss() {
    const typo = getTutuTypographyState();

    if (!typo.enabled) return '';

    const { fontFace, family } = getTutuTypographyFont(typo);
    const body = buildTutuTypographyDeclarations(typo, family, true, true);

    return `${fontFace}\nbody {\n    ${body};\n}\nbody.tutu-typo-formatted { white-space: normal !important; }\n`
        + buildTutuTypographyStructureCss(typo, 'body');
}

/**
 * 页面上不走 iframe 的纯文本排版样式：
 * - .tutu-typo-plain：用 textContent 显示的原文（面板预览、嵌入楼层、全屏、收藏），保留换行
 * - .tutu-typo-rendered：捕捉标签里由酒馆渲染过的纯文本（换行已转成 <br>/<p>）
 * HTML 小剧场不会带这两个类。
 */
function applyTutuTypographyStyle() {
    const styleId = 'tutu_typography_style';
    let style = document.getElementById(styleId);

    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }

    const typo = getTutuTypographyState();

    if (!typo.enabled) {
        style.textContent = '';
        return;
    }

    const { fontFace, family } = getTutuTypographyFont(typo);
    const declarations = buildTutuTypographyDeclarations(typo, family, true, true);

    style.textContent = `${fontFace}
.tutu-typo-plain,
.tutu-typo-rendered {
    ${declarations};
    word-break: break-word !important;
    border-radius: 8px;
    box-sizing: border-box;
}
.tutu-typo-plain {
    white-space: pre-wrap !important;
}
.tutu-typo-plain.tutu-typo-formatted {
    white-space: normal !important;
}
.tutu-typo-rendered :is(p, span, em, i, strong, b, q, li, blockquote, font) {
    font-family: inherit !important;
    font-size: inherit !important;
    line-height: inherit !important;
}
/* 捕捉标签：酒馆已渲染成 <p>，用 CSS 实现缩进 / 段距 / 首字放大 / 引号高亮 */
.tutu-typo-rendered p {
    margin: 0 0 ${typo.paragraphSpacing}em !important;
    text-indent: ${typo.textIndent}em !important;
}
${typo.dropCap ? `.tutu-typo-rendered > p:first-of-type { text-indent: 0 !important; }
.tutu-typo-rendered > p:first-of-type::first-letter {
    float: left;
    font-size: 2.6em;
    line-height: 1;
    font-weight: 700;
    margin: 0.06em 0.12em 0 0;
    color: ${sanitizeTutuCssValue(typo.quoteColor) || '#c96f4a'};
}` : ''}
${typo.quoteHighlight ? `.tutu-typo-rendered q { color: ${sanitizeTutuCssValue(typo.quoteColor) || '#c96f4a'} !important; }` : ''}
${buildTutuTypographyStructureCss(typo, '.tutu-typo-formatted')}`;
}

/**
 * 捕捉标签内容是否为纯文本：只含酒馆 Markdown 产生的简单标签。
 */
function isTutuCapturedPlainText(html) {
    return !isProbablyHtml(
        String(html || '').replace(/<\/?(p|br|em|i|strong|b|q|span|del|u|s)(\s[^>]*)?>/gi, '')
    );
}

// ==========================================
// 一键自适应：标签夺舍 CSS
// ==========================================
const TUTU_AUTOFIT_BUILTIN = 'autofit';

/**
 * 夺舍所有标签的固定尺寸：
 * - 宽度一律不超过容器，固定 px 宽度失效
 * - 100vh / min-height 撑满屏幕的布局改为随内容
 * - 图片、视频、canvas、svg 等等比缩放
 * - 长文本、代码块自动换行，不再出现横向滚动条
 */
const TUTU_AUTOFIT_CSS = `/* 克制放映室 · 一键自适应（标签夺舍） */
html, body {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    overflow-x: hidden !important;
    box-sizing: border-box !important;
}

*, *::before, *::after {
    box-sizing: border-box !important;
    max-width: 100% !important;
    min-width: 0 !important;
}

body * {
    overflow-wrap: anywhere;
}

[style*="width"] {
    max-width: 100% !important;
}

[style*="vh"], [style*="min-height"] {
    min-height: 0 !important;
}

[style*="100vh"], [style*="100dvh"], [style*="100svh"] {
    height: auto !important;
}

[style*="position: fixed"], [style*="position:fixed"] {
    position: absolute !important;
}

img, video, canvas, svg, picture, iframe, embed, object {
    max-width: 100% !important;
    height: auto;
}

img, video {
    height: auto !important;
    object-fit: contain;
}

table {
    display: block;
    width: auto !important;
    max-width: 100% !important;
    overflow-x: auto;
}

pre, code, textarea {
    white-space: pre-wrap !important;
    word-break: break-word !important;
}
`;

function getTutuAutoFitCssItem() {
    return tutuRenderLibrary.css.find(
        item => item.builtin === TUTU_AUTOFIT_BUILTIN
    ) || null;
}

function isTutuAutoFitActive() {
    const item = getTutuAutoFitCssItem();
    return Boolean(tutuSettings.renderCssEnabled && item?.enabled);
}

/**
 * iframe 没有 allow-same-origin，外部读不到内部高度，
 * 所以在内部注入一段脚本，用 postMessage 把内容高度报给外部。
 */
function injectTutuAutoHeightScript(html) {
    const script = `<script>
(function () {
    var last = 0;
    function report() {
        var body = document.body;
        if (!body) return;
        var height = Math.ceil(Math.max(
            body.scrollHeight,
            body.offsetHeight,
            body.getBoundingClientRect().height
        ));
        if (Math.abs(height - last) < 2) return;
        last = height;
        parent.postMessage({ type: 'tutu-theater-height', height: height }, '*');
    }
    window.addEventListener('load', report);
    window.addEventListener('resize', report);
    if (window.ResizeObserver) {
        new ResizeObserver(report).observe(document.documentElement);
    }
    document.addEventListener('DOMContentLoaded', report);
    setTimeout(report, 50);
    setTimeout(report, 600);
})();
<\/script>`;

    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${script}\n</body>`);
    }

    return `${html}\n${script}`;
}

/**
 * 接收 iframe 报来的高度，只调整嵌入楼层 / 面板预览 / 收藏里的 iframe，
 * 全屏查看保持铺满。
 */
function initTutuAutoHeightListener() {
    if (window.__tutuAutoHeightListener) return;
    window.__tutuAutoHeightListener = true;

    window.addEventListener('message', event => {
        const data = event.data;

        if (!data || data.type !== 'tutu-theater-height') return;
        if (!isTutuAutoFitActive() && !isTutuAntiClipActive()) return;

        const height = Number(data.height);

        if (!Number.isFinite(height) || height <= 0) return;

        const iframe = Array.from(document.querySelectorAll('iframe')).find(
            frame => frame.contentWindow === event.source
        );

        if (!iframe || iframe.classList.contains('tutu-fullscreen-iframe')) return;

        const inTheater = iframe.closest(
            '.tutu-theater-embed, #tutu_result_preview, .tutu-favorite-card, #tutu_theater_panel'
        );

        if (!inTheater) return;

        /*
         * 防止 100vh 之类的布局形成「iframe 变高 → 内容变高」的死循环：
         * 2 秒内连续增高超过 12 次就停止调整，保持当前高度。
         */
        const now = Date.now();
        const state = iframe._tutuHeightState || { count: 0, since: now, last: 0 };

        if (now - state.since > 2000) {
            state.count = 0;
            state.since = now;
        }

        if (height > state.last) state.count += 1;
        state.last = height;
        iframe._tutuHeightState = state;

        if (state.count > 12) return;

        const finalHeight = Math.min(Math.max(height, 40), 20000);

        iframe.style.setProperty('height', `${finalHeight}px`, 'important');
        iframe.style.setProperty('min-height', '0', 'important');
    });
}

/**
 * 一键添加 / 更新内置自适应 CSS。
 * 已存在时用最新版本覆盖并重新启用。
 */
function applyTutuAutoFitCss() {
    const existing = getTutuAutoFitCssItem();

    if (existing) {
        existing.css = TUTU_AUTOFIT_CSS;
        existing.enabled = true;
    } else {
        tutuRenderLibrary.css.unshift({
            id: createTutuRenderId('css'),
            name: '一键自适应（标签夺舍）',
            css: TUTU_AUTOFIT_CSS,
            source: '内置',
            enabled: true,
            builtin: TUTU_AUTOFIT_BUILTIN,
        });
    }

    if (!tutuSettings.renderCssEnabled) {
        tutuSettings.renderCssEnabled = true;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(tutuSettings));
    }

    saveTutuRenderLibrary();

    return Boolean(existing);
}

function renderTutuRenderManager() {
    $('#tutu_render_regex_enabled').prop(
        'checked',
        tutuSettings.renderRegexEnabled !== false
    );

    $('#tutu_render_css_enabled').prop(
        'checked',
        tutuSettings.renderCssEnabled !== false
    );

    const renderList = (selector, kind, items, getTitle, getDetail) => {
        const $list = $(selector);

        if (!$list.length) return;

        $list.empty();

        if (!items.length) {
            $list.append(
                $('<div class="tutu-render-empty"></div>').text(
                    kind === 'regex'
                        ? '还没有渲染正则'
                        : '还没有渲染 CSS'
                )
            );
            return;
        }

        items.forEach(item => {
            const $row = $(`
                <div class="tutu-render-item">
                    <input type="checkbox" class="tutu-render-toggle">
                    <div class="tutu-render-info">
                        <div class="tutu-render-name"></div>
                        <div class="tutu-render-detail"></div>
                    </div>
                    <div class="menu_button margin0 tutu-icon-btn tutu-render-delete" title="删除">
                        <i class="fa-solid fa-trash-can"></i>
                    </div>
                </div>
            `);

            $row.attr({ 'data-kind': kind, 'data-id': item.id });
            $row.find('.tutu-render-toggle').prop('checked', item.enabled);
            $row.find('.tutu-render-name').text(getTitle(item));
            $row.find('.tutu-render-detail').text(getDetail(item));

            $list.append($row);
        });
    };

    renderTutuRenderGroups();
    renderTutuRenderRegexList();

    $('#tutu_render_autofit_btn').toggleClass(
        'tutu-render-autofit-on',
        isTutuAutoFitActive()
    );

    $('#tutu_render_anti_clip').prop('checked', isTutuAntiClipActive());

    renderList(
        '#tutu_render_css_list',
        'css',
        tutuRenderLibrary.css,
        item => item.name,
        item =>
            `${item.source ? `[${item.source}] ` : ''}${item.css
                .replace(/\s+/g, ' ')
                .slice(0, 80)}`
    );

    // 绑定面板打开时，规则变化后重新刷新一次目标名称
    const $bindPanel = $('#tutu_render_bind_panel');

    if ($bindPanel.is(':visible')) {
        const target = getTutuRenderBindTarget(
            $bindPanel.attr('data-kind'),
            $bindPanel.attr('data-id')
        );

        if (!target) {
            $bindPanel.hide();
        }
    }
}

function getTutuScenarioNameById(id) {
    const item = (tutuScenarios || []).find(scenario => scenario?.id === id);
    return item ? String(item.name || '未命名剧本') : '';
}

/**
 * 绑定说明文字：未绑定 / 绑定 N 个条目（显示前几个名称）
 */
function describeTutuBinding(ids, emptyText) {
    if (!ids?.length) return emptyText;

    const names = ids
        .map(getTutuScenarioNameById)
        .filter(Boolean);
    const missing = ids.length - names.length;
    const preview = names.slice(0, 3).join('、');

    let text = `绑定 ${ids.length} 个条目`;

    if (preview) {
        text += `：${preview}${names.length > 3 ? '…' : ''}`;
    }

    if (missing > 0) {
        text += `（${missing} 个已删除）`;
    }

    return text;
}

function renderTutuRenderGroups() {
    const $list = $('#tutu_render_group_list');

    if (!$list.length) return;

    $list.empty();

    const groups = tutuRenderLibrary.groups;

    if (!groups.length) {
        $list.append(
            $('<div class="tutu-render-empty"></div>').text(
                '还没有分组。分组可整体开关，也可整体绑定小剧场条目。'
            )
        );
        return;
    }

    groups.forEach(group => {
        const count = tutuRenderLibrary.regex.filter(
            item => item.groupId === group.id
        ).length;

        const $row = $(`
            <div class="tutu-render-item tutu-render-group-item">
                <input type="checkbox" class="tutu-render-toggle">
                <div class="tutu-render-info">
                    <div class="tutu-render-name"></div>
                    <div class="tutu-render-detail"></div>
                </div>
                <div class="menu_button margin0 tutu-icon-btn tutu-render-bind" title="绑定小剧场条目">
                    <i class="fa-solid fa-link"></i>
                </div>
                <div class="menu_button margin0 tutu-icon-btn tutu-render-group-rename" title="重命名">
                    <i class="fa-solid fa-pen"></i>
                </div>
                <div class="menu_button margin0 tutu-icon-btn tutu-render-delete" title="删除分组（组内正则保留）">
                    <i class="fa-solid fa-trash-can"></i>
                </div>
            </div>
        `);

        $row.attr({ 'data-kind': 'groups', 'data-id': group.id });
        $row.toggleClass('tutu-render-bound', group.bindScenarioIds.length > 0);
        $row.find('.tutu-render-toggle').prop('checked', group.enabled);
        $row.find('.tutu-render-name').text(`${group.name}（${count}）`);
        $row.find('.tutu-render-detail').text(
            describeTutuBinding(group.bindScenarioIds, '全局生效')
        );

        $list.append($row);
    });
}

function renderTutuRenderRegexList() {
    const $list = $('#tutu_render_regex_list');

    if (!$list.length) return;

    $list.empty();

    const regexList = tutuRenderLibrary.regex;

    if (!regexList.length) {
        $list.append(
            $('<div class="tutu-render-empty"></div>').text('还没有渲染正则')
        );
        return;
    }

    // 按分组顺序排列：各分组在前，未分组在后
    const sections = [
        ...tutuRenderLibrary.groups.map(group => ({
            group,
            items: regexList.filter(item => item.groupId === group.id),
        })),
        {
            group: null,
            items: regexList.filter(item => !item.groupId),
        },
    ].filter(section => section.items.length);

    const showHeaders = tutuRenderLibrary.groups.length > 0;

    sections.forEach(section => {
        if (showHeaders) {
            const $header = $('<div class="tutu-render-section-title"></div>');

            $header.text(
                section.group
                    ? `📁 ${section.group.name}${section.group.enabled ? '' : '（已关闭）'}`
                    : '未分组'
            );
            $list.append($header);
        }

        section.items.forEach(item => {
            const $row = $(`
                <div class="tutu-render-item">
                    <input type="checkbox" class="tutu-render-toggle">
                    <div class="tutu-render-info">
                        <div class="tutu-render-name"></div>
                        <div class="tutu-render-detail"></div>
                        <div class="tutu-render-bind-info"></div>
                    </div>
                    <select class="text_pole tutu-render-group-select" title="移动到分组"></select>
                    <div class="menu_button margin0 tutu-icon-btn tutu-render-bind" title="单独绑定小剧场条目">
                        <i class="fa-solid fa-link"></i>
                    </div>
                    <div class="menu_button margin0 tutu-icon-btn tutu-render-delete" title="删除">
                        <i class="fa-solid fa-trash-can"></i>
                    </div>
                </div>
            `);

            const $select = $row.find('.tutu-render-group-select');

            $select.append($('<option value=""></option>').text('未分组'));
            tutuRenderLibrary.groups.forEach(group => {
                $select.append(
                    $('<option></option>').val(group.id).text(group.name)
                );
            });
            $select.val(item.groupId || '');

            let bindText;

            if (item.bindScenarioIds.length) {
                bindText = `🔗 ${describeTutuBinding(item.bindScenarioIds, '')}`;
            } else if (section.group?.bindScenarioIds.length) {
                bindText = `跟随分组：${describeTutuBinding(section.group.bindScenarioIds, '')}`;
            } else {
                bindText = '全局生效';
            }

            $row.attr({ 'data-kind': 'regex', 'data-id': item.id });
            $row.toggleClass('tutu-render-bound', item.bindScenarioIds.length > 0);
            $row.find('.tutu-render-toggle').prop('checked', item.enabled);
            $row.find('.tutu-render-name').text(item.scriptName);
            $row.find('.tutu-render-detail').text(
                `${item.source ? `[${item.source}] ` : ''}${item.findRegex}`
            );
            $row.find('.tutu-render-bind-info').text(bindText);

            $list.append($row);
        });
    });
}

function getTutuRenderBindTarget(kind, id) {
    if (kind !== 'regex' && kind !== 'groups') return null;

    return (tutuRenderLibrary[kind] || []).find(item => item.id === id) || null;
}

/**
 * 打开绑定面板：按分类列出所有剧本条目，可勾选、搜索。
 */
function openTutuRenderBindPanel(kind, id) {
    const target = getTutuRenderBindTarget(kind, id);
    const $panel = $('#tutu_render_bind_panel');

    if (!target || !$panel.length) return;

    ensureTutuScenarioIds();

    const label = kind === 'groups' ? `分组「${target.name}」` : `正则「${target.scriptName}」`;
    const selected = new Set(target.bindScenarioIds);

    $panel.attr({ 'data-kind': kind, 'data-id': id });
    $panel.find('.tutu-render-bind-title').text(`绑定小剧场条目：${label}`);
    $panel.find('.tutu-render-bind-search').val('');

    const $options = $panel.find('.tutu-render-bind-options').empty();
    const scenarios = (tutuScenarios || []).filter(item => item?.id);

    if (!scenarios.length) {
        $options.append(
            $('<div class="tutu-render-empty"></div>').text('剧本库里还没有条目')
        );
    } else {
        const byCategory = new Map();

        scenarios.forEach(item => {
            const category = String(item.category || '未分类').trim() || '未分类';

            if (!byCategory.has(category)) byCategory.set(category, []);
            byCategory.get(category).push(item);
        });

        byCategory.forEach((items, category) => {
            const $group = $('<div class="tutu-render-bind-category"></div>');
            const $title = $(`
                <label class="tutu-render-bind-category-title">
                    <input type="checkbox" class="tutu-render-bind-category-check">
                    <span></span>
                </label>
            `);

            $title.find('span').text(category);
            $group.append($title);

            items.forEach(item => {
                const $option = $(`
                    <label class="tutu-render-bind-option">
                        <input type="checkbox" class="tutu-render-bind-check">
                        <span></span>
                    </label>
                `);

                $option.find('input')
                    .val(item.id)
                    .prop('checked', selected.has(item.id));
                $option.find('span').text(item.name || '未命名剧本');
                $option.attr('data-search', `${item.name || ''} ${category}`.toLowerCase());
                $group.append($option);
            });

            $options.append($group);
        });
    }

    syncTutuRenderBindCategoryChecks();
    $panel.show();

    $panel[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function syncTutuRenderBindCategoryChecks() {
    $('#tutu_render_bind_panel .tutu-render-bind-category').each(function () {
        const $checks = $(this).find('.tutu-render-bind-check');
        const checked = $checks.filter(':checked').length;

        $(this).find('.tutu-render-bind-category-check')
            .prop('checked', checked > 0 && checked === $checks.length)
            .prop('indeterminate', checked > 0 && checked < $checks.length);
    });
}

/**
 * 渲染规则变化后，重新渲染面板当前结果和已嵌入楼层。
 */
function refreshTutuCurrentRender() {
    // 重新渲染会重建列表，记下滚动位置，渲染完还原
    const scrollers = [
        ...document.querySelectorAll('#tutu_theater_panel *, .tutu-fullscreen-body, #chat'),
    ].filter(element => element.scrollTop > 0).map(element => [element, element.scrollTop]);

    document.querySelectorAll('.tutu-fullscreen-plain').forEach(element => {
        if (element._tutuSourceText) fillTutuPlainText(element, element._tutuSourceText);
    });

    document.querySelectorAll('.tutu-fullscreen-iframe').forEach(iframe => {
        if (iframe._tutuSourceText && !isProbablyHtml(iframe._tutuSourceText)) {
            iframe.srcdoc = buildTutuRenderedContent(iframe._tutuSourceText).html;
        }
    });

    if (String(tutuCurrentResultContent || '').trim()) {
        const status = $('#tutu_result_status').text();
        showTutuResult(tutuCurrentResultContent);
        $('#tutu_result_status').text(status);
    }

    try {
        $('.mes_text .tutu-theater-embed').remove();
        restoreAllTutuTheaterEmbeds();
    } catch (error) {
        console.warn('[克制放映室] 刷新嵌入楼层失败：', error);
    }

    try {
        renderTutuFavorites();
    } catch (error) {
        console.warn('[克制放映室] 刷新收藏失败：', error);
    }

    scrollers.forEach(([element, top]) => {
        if (element.isConnected) element.scrollTop = top;
    });
}
// 给旧剧本补充分类字段
let tutuScenarioChanged = false;

tutuScenarios = Array.isArray(tutuScenarios)
    ? tutuScenarios.map(item => {
        if (!item || typeof item !== 'object') {
            tutuScenarioChanged = true;

            return {
                name: '未命名剧本',
                desc: '',
                category: '未分类',
                prompt: '',
            };
        }

        if (!item.category || !String(item.category).trim()) {
            tutuScenarioChanged = true;

            return {
                ...item,
                category: '未分类',
            };
        }

        return {
            ...item,
            category: String(item.category).trim(),
        };
    })
    : [];

if (tutuScenarioChanged) {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );
}

    if (tutuScenarios.length === 0) {
tutuScenarios = [
    {
        name: "🍳 厨房大乱斗",
        desc: "角色在厨房里手忙脚乱地准备晚餐。",
        prompt: "角色正在厨房里手忙脚乱地准备晚餐，结果把盐当成了糖..."
    }
];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tutuScenarios));
    }
const scenarioCategories = tutuScenarios
    .map(item => String(item.category || '未分类').trim())
    .filter(Boolean);

tutuCategories = Array.from(
    new Set([
        ...tutuCategories,
        ...scenarioCategories,
    ])
);

if (!tutuCategories.length) {
    tutuCategories = ['未分类'];
}

localStorage.setItem(
    CATEGORIES_KEY,
    JSON.stringify(tutuCategories)
);

    // ==========================================
    // 1. 注入 CSS 样式
    // ==========================================
    const tutuStyle = `
        <style>
        </style>
    `;
    $('head').append(tutuStyle);



    // ==========================================
    // 2. 构建面板 HTML
    // ==========================================
    const menuButtonHtml = `
        <div id="option_tutu_theater" class="list-group-item flex-container flexGap5 interactable" title="生成外置小剧场" tabindex="0" role="listitem">
            <div class="fa-fw fa-solid fa-paw extensionsMenuExtensionButton"></div>
            <span>克制放映室</span>
        </div>
    `;

    const panelHtml = `
       <div id="tutu_theater_panel">


            
            <!-- 头部 -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0; font-size: 1.3em;">🐱 克制放映室</h3>
                <div id="tutu_close" class="fa-solid fa-xmark interactable hoverglow" title="关闭" style="font-size: 1.5em; cursor: pointer;"></div>
            </div>
            
<div class="tutu-icon-toolbar">

    <div
        class="tutu-icon-tab active"
        data-tab="tutu_tab_generate"
        title="生成小剧场">
        <i class="fa-solid fa-display"></i>
        <span>预览</span>
    </div>

    <div
        class="tutu-icon-tab"
        data-tab="tutu_tab_library"
        title="我的剧本">
        <i class="fa-solid fa-book"></i>
        <span>剧本</span>
    </div>

    <div
        class="tutu-icon-tab"
        data-tab="tutu_tab_import"
        title="批量导入">
        <i class="fa-solid fa-download"></i>
        <span>导入</span>
    </div>

    <div
        class="tutu-icon-tab"
        data-tab="tutu_tab_settings"
        title="设置">
        <i class="fa-solid fa-sliders"></i>
        <span>设置</span>
    </div>
<div
    class="tutu-icon-tab"
    data-tab="tutu_tab_favorites"
    title="我的收藏">
    <i class="fa-solid fa-heart"></i>
    <span>收藏</span>
</div>

</div>



            <!-- TAB 1: 生成区 -->
<div id="tutu_tab_generate" class="tutu-tab-content active">

    <!-- 顶部紧凑控制区：输入框 + 全部图标按钮同一行 -->
    <div class="tutu-compact-control-panel">

        <div class="tutu-prompt-row">
            <textarea
                id="tutu_prompt"
                class="text_pole"
                rows="1"
                placeholder="输入情境，或从剧本库载入……"></textarea>

            <div class="tutu-prompt-tools">

                <div
                    id="tutu_generate_btn"
                    class="tutu-icon-action primary"
                    role="button"
                    tabindex="0"
                    aria-label="生成小剧场"
                    title="生成小剧场">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                </div>

                <div
                    id="tutu_random_script_btn"
                    class="tutu-icon-action"
                    role="button"
                    tabindex="0"
                    aria-label="随机选择剧本并生成"
                    title="随机剧本">
                    <i class="fa-solid fa-shuffle"></i>
                </div>

                <div
                    id="tutu_context_toggle_btn"
                    class="tutu-icon-action"
                    role="button"
                    tabindex="0"
                    aria-label="展开角色与世界书"
                    title="读取内容">
                    <i class="fa-solid fa-book-open"></i>
                </div>

                <div
                    id="tutu_clear_prompt_btn"
                    class="tutu-icon-action"
                    role="button"
                    tabindex="0"
                    aria-label="清空情境"
                    title="清空">
                    <i class="fa-solid fa-eraser"></i>
                </div>

                <div
                    id="tutu_auto_status"
                    class="tutu-auto-status"
                    role="status"
                    aria-label="手动生成"
                    title="手动生成">
                    <i class="fa-solid fa-circle"></i>
                </div>

            </div>
        </div>

        <div class="tutu-format-row" role="radiogroup" aria-label="生成格式">
            <span class="tutu-format-label">格式</span>
            <button type="button" class="tutu-format-btn" data-format="text" role="radio" aria-checked="true"
                title="纯文本：自动套用排版美化（段落、对话、微信气泡）">
                <i class="fa-solid fa-align-left"></i>
                纯文本
            </button>
            <button type="button" class="tutu-format-btn" data-format="html" role="radio" aria-checked="false"
                title="HTML：生成可交互网页，同时适配手机和电脑">
                <i class="fa-solid fa-code"></i>
                HTML
            </button>
            <span id="tutu_format_hint" class="tutu-format-hint"></span>
        </div>

    </div>


    <!-- 角色、世界书、历史记录，默认隐藏 -->
    <div
        id="tutu_character_context_box"
        class="tutu-context-box tutu-collapsible-context"
        style="display:none;">

        <div
            id="tutu_worldbook_toggle"
            class="tutu-context-toggle"
            role="button"
            tabindex="0">

            <div class="tutu-context-title">
                <i class="fa-solid fa-book"></i>
                当前角色关联世界书
            </div>

            <i
                id="tutu_worldbook_toggle_icon"
                class="fa-solid fa-chevron-down">
            </i>
        </div>

        <div
            id="tutu_worldbook_content"
            class="tutu-worldbook-content"
            style="display:none;">

            <div
                id="tutu_character_worldbook_name"
                class="tutu-context-worldbook">
                正在读取世界书……
            </div>

            <div
                id="tutu_character_worldbook_entries"
                class="tutu-context-worldbook-entries">
                正在读取世界书条目……
            </div>
        </div>

        <label class="tutu-history-option">
            <input type="checkbox" id="tutu_include_history">
            <span>读取历史聊天记录</span>
        </label>

        <div id="tutu_history_limit_box" style="display:none;">
            <label class="tutu-settings-label">
                读取最近多少条消息
            </label>

            <input
                id="tutu_history_limit"
                class="text_pole"
                type="number"
                min="1"
                max="100"
                value="20">

            <label class="tutu-settings-label" for="tutu_history_include_tags">
                只读标签（只读取这些标签内的内容）
            </label>

            <input
                id="tutu_history_include_tags"
                class="text_pole"
                type="text"
                placeholder="例如：content, 正文">

            <label class="tutu-settings-label" for="tutu_history_exclude_tags">
                排除标签（删除这些标签及其内容）
            </label>

            <input
                id="tutu_history_exclude_tags"
                class="text_pole"
                type="text"
                placeholder="例如：thinking, status, 状态栏">

            <label class="tutu-history-option">
                <input type="checkbox" id="tutu_history_exclude_comments">
                <span>自动排除注释（&lt;!-- --&gt;、未闭合的注释）</span>
            </label>

            <div class="tutu-api-help">
                多个标签用逗号分隔，不需要写尖括号。先排除注释，再排除标签，最后只读；
                设置了只读标签后，没有包含这些标签的 AI 消息会被跳过，用户消息保留原文。
            </div>
        </div>

    </div>

    <!-- 主要内容：预览与源码 -->
    <div id="tutu_result_box" class="tutu-result-box">

<div class="tutu-result-toolbar">
    <div id="tutu_result_status" class="text_muted">
        等待导演开始……
    </div>

    <div class="tutu-result-toolbar-right">
<select
    id="tutu_export_format"
    class="text_pole tutu-export-format-select"
    title="选择导出格式">
    <option value="text">纯文本 TXT</option>
    <option value="image">书摘图片 PNG</option>
</select>



        <div
            id="tutu_continue_current_btn"
            class="tutu-result-mode-btn"
            role="button"
            tabindex="0"
            aria-label="续写当前小剧场"
            title="续写：以当前内容为开头继续生成（生成到一半中断时使用）">
            <i class="fa-solid fa-forward"></i>
        </div>

        <div
            id="tutu_favorite_current_btn"
            class="tutu-result-mode-btn"
            title="收藏当前小剧场">
            <i class="fa-regular fa-heart"></i>
        </div>

<div
    id="tutu_export_current_btn"
    class="tutu-result-mode-btn"
    title="导出当前小剧场">
    <i class="fa-solid fa-file-export"></i>
</div>

<div
    id="tutu_edit_dialogue_btn"
    class="tutu-result-mode-btn"
    role="button"
    tabindex="0"
    aria-label="修正对话气泡"
    title="修正气泡：改说话人名字、取消气泡、区分台词和强调">
    <i class="fa-solid fa-pen-to-square"></i>
</div>

<div
    id="tutu_fullscreen_current_btn"
    class="tutu-result-mode-btn"
    title="放大查看当前小剧场">
    <i class="fa-solid fa-expand"></i>
</div>

<div class="tutu-result-mode-buttons">
    <div id="tutu_show_preview_btn" class="tutu-result-mode-btn active" title="预览">
        <i class="fa-solid fa-display"></i>
    </div>
    <div id="tutu_show_source_btn" class="tutu-result-mode-btn" title="源码">
        <i class="fa-solid fa-code"></i>
    </div>
</div>
    </div>
</div>


        <div id="tutu_result_preview" class="tutu-result-preview">
            <div class="tutu-result-placeholder">
                生成的小剧场会显示在这里
            </div>
        </div>

        <pre id="tutu_result_source" class="tutu-result-source"></pre>

    </div>

</div>

<!-- TAB 2: 我的剧本库 -->
<div id="tutu_tab_library" class="tutu-tab-content">

<div class="tutu-library-toolbar">
    <div class="tutu-library-title">
        <i class="fa-solid fa-book"></i>
        我的剧本
    </div>

    <div class="tutu-library-category-tools">
        <input
            id="tutu_new_category_input"
            class="text_pole"
            type="text"
            aria-label="新分类名称"
            placeholder="新分类名称">

        <div
            id="tutu_add_category_btn"
            class="tutu-icon-action"
            role="button"
            tabindex="0"
            aria-label="新建分类"
            title="新建分类">
            <i class="fa-solid fa-folder-plus"></i>
        </div>

<div id="tutu_new_script_btn" class="tutu-icon-action primary" role="button" tabindex="0" aria-label="新建剧本" title="新建剧本">
    <i class="fa-solid fa-plus"></i>
</div>

<div
    id="tutu_batch_manage_btn"
    class="tutu-icon-action"
    role="button"
    tabindex="0"
    aria-label="批量管理剧本"
    title="批量管理">

    <i class="fa-solid fa-list-check"></i>
</div>

        <!-- 打开导入导出面板 -->
        <div
            id="tutu_toggle_transfer_btn"
            class="tutu-icon-action"
            role="button"
            tabindex="0"
            aria-label="导入导出"
            title="导入导出">
            <i class="fa-solid fa-file-arrow-up"></i>
        </div>
    </div>
</div>
<div
    id="tutu_batch_manage_panel"
    class="tutu-batch-manage-panel"
    style="display:none;">

    <div class="tutu-batch-manage-left">

        <label class="tutu-batch-select-all-label">
            <input
                type="checkbox"
                id="tutu_batch_select_all">

            <span>
                全选
            </span>
        </label>

        <span id="tutu_batch_selected_count">
            已选择 0 个剧本
        </span>

    </div>

    <div class="tutu-batch-manage-right">

        <select
            id="tutu_batch_target_category"
            class="text_pole">
        </select>

        <button
            type="button"
            id="tutu_batch_move_btn"
            class="menu_button">

            <i class="fa-solid fa-folder-tree"></i>
            移动到分类
        </button>

        <button
            type="button"
            id="tutu_batch_cancel_btn"
            class="menu_button">

            退出
        </button>

    </div>
</div>

<!-- 小剧场导入导出面板 -->
<div
    id="tutu_transfer_panel"
    class="tutu-transfer-panel"
    style="display:none;">

    <div class="tutu-transfer-panel-header">
        <div class="tutu-transfer-panel-title">
            <i class="fa-solid fa-box-archive"></i>
            小剧场导入导出
        </div>

        <div
            id="tutu_close_transfer_btn"
            class="tutu-icon-action"
            role="button"
            tabindex="0"
            title="关闭">
            <i class="fa-solid fa-xmark"></i>
        </div>
    </div>

    <div class="tutu-transfer-row">
        <label class="tutu-settings-label">
            导出范围
        </label>

        <select
            id="tutu_export_scope"
            class="text_pole">

            <option value="all">
                全部分类和剧本
            </option>

            <option value="category">
                指定分类
            </option>
        </select>
    </div>

    <div
        id="tutu_export_category_row"
        class="tutu-transfer-row"
        style="display:none;">

        <label class="tutu-settings-label">
            选择分类
        </label>

        <select
            id="tutu_export_category"
            class="text_pole">
        </select>
    </div>

    <div class="tutu-transfer-row">
        <label class="tutu-settings-label">
            导出格式
        </label>

        <select
            id="tutu_export_type"
            class="text_pole">

            <option value="tutu_json">
                克制放映室 JSON
            </option>

            <option value="st_preset">
                SillyTavern 对话补全预设
            </option>

            <option value="st_worldbook">
                SillyTavern 世界书
            </option>
        </select>
    </div>

    <div class="tutu-transfer-actions">
        <button
            type="button"
            id="tutu_export_library_btn"
            class="menu_button">

            <i class="fa-solid fa-file-export"></i>
            导出小剧场
        </button>

        <button
            type="button"
            id="tutu_import_library_btn"
            class="menu_button">

            <i class="fa-solid fa-file-import"></i>
            导入克制 JSON
        </button>

        <input
            type="file"
            id="tutu_import_library_file"
            accept=".json,application/json"
            style="display:none;">
    </div>

    <div class="tutu-api-help">
        克制 JSON 会完整保存分类、剧本名称、简介和正文。
        <br>
        导入功能只接受克制放映室 JSON，不会把 SillyTavern 预设或世界书误导入剧本库。
    </div>
</div>





    <!-- 新建 / 编辑剧本表单，默认隐藏 -->
    <div id="tutu_script_editor" class="tutu-script-editor" style="display:none;">

        <div class="tutu-editor-header">
            <strong id="tutu_editor_title">新建剧本</strong>

            <div id="tutu_cancel_edit_btn"
                 class="menu_button margin0 tutu-small-btn">
                取消
            </div>
        </div>

        <input
            type="text"
            id="tutu_script_name"
            class="text_pole"
            placeholder="剧本名称，例如：厨房大乱斗"
        >

        <input
            type="text"
            id="tutu_script_desc"
            class="text_pole"
            placeholder="简介，可不填写"
        >
<input
    type="text"
    id="tutu_script_category"
    class="text_pole"
    placeholder="剧本分类，例如：日常、战斗、校园、搞笑"
    value="未分类"
>

        <textarea
            id="tutu_script_prompt"
            class="text_pole"
            rows="7"
            placeholder="请输入剧本内容或情境..."
        ></textarea>

        <div
            id="tutu_save_btn"
            class="menu_button tutu-save-script-btn">
            <i class="fa-solid fa-save"></i>
            保存剧本
        </div>
    </div>

    <!-- 剧本列表 -->
    <div id="tutu_library_list" class="tutu-library-list">
        <!-- JS 渲染的剧本库 -->
    </div>
</div>


<!-- TAB 3: 多选批量导入系统预设 -->
<div
    id="tutu_tab_import"
    class="tutu-tab-content">

    <!-- 导入来源和目标 -->
    <div class="tutu-native-import-toolbar">

        <select
            id="tutu_preset_type"
            class="text_pole">

            <option value="openai" selected>
                对话补全预设
            </option>

            <option value="worldbook">
                世界书
            </option>

            <option value="openai_regex">
                预设绑定正则（渲染用）
            </option>
        </select>

        <select
            id="tutu_import_target"
            class="text_pole">

            <option value="scenario">
                导入为剧本
            </option>

            <option value="jailbreak">
                导入为破限
            </option>

            <option value="style">
                导入为文风
            </option>

            <option value="extra">
                导入为附加（禁词等）
            </option>

            <option value="render_css">
                导入为渲染 CSS
            </option>
        </select>
<select
    id="tutu_import_category"
    class="text_pole"
    title="选择导入剧本的分类">

    <option value="">
        请选择剧本分类
    </option>
</select>
        <select
            id="tutu_preset_file"
            class="text_pole">

            <option value="">
                请选择预设或世界书
            </option>
        </select>

    </div>

    <!-- 全选和导入按钮 -->
    <div class="tutu-native-import-actions">

        <label class="tutu-native-select-all">
            <input
                type="checkbox"
                id="tutu_select_all">

            <span>
                全选
            </span>
        </label>

<div
    id="tutu_import_selected_btn"
    class="menu_button margin0 tutu-native-import-icon-btn"
    role="button"
    tabindex="0"
    aria-label="导入所选项"
    title="导入所选项">

    <i class="fa-solid fa-download"></i>
</div>
    </div>

    <!-- 预设或世界书条目列表 -->
    <div
        id="tutu_native_prompts_list"
        class="tutu-native-prompts-list">

        <div class="tutu-native-import-placeholder">
            请选择对话补全预设或世界书
        </div>

    </div>

</div>


<!-- TAB 4: 设置 -->
<div id="tutu_tab_settings" class="tutu-tab-content">

    <div class="tutu-settings-section">
    <div class="tutu-appearance-manager">
    <div class="tutu-settings-title">
        <i class="fa-solid fa-palette"></i>
        界面外观
    </div>

    <label class="tutu-settings-label" for="tutu_ui_theme">
        管理器样式
    </label>

    <select id="tutu_ui_theme" class="text_pole">
        <option value="classic">经典主题</option>
        <option value="cream">奶油手账</option>
        <option value="neumorphic">新拟态</option>
        <option value="editorial">编辑部</option>
<option value="polaroid">拍立得相机</option>
        <option value="archive">纸张档案</option>
        <option value="custom">自定义 CSS</option>
    </select>

    <div
        id="tutu_theme_preview_list"
        class="tutu-theme-preview-list">

        <button
            type="button"
            class="tutu-theme-preview active"
            data-theme="classic">
            <span class="tutu-theme-preview-swatch classic"></span>
            <span>经典</span>
        </button>

        <button
            type="button"
            class="tutu-theme-preview"
            data-theme="cream">
            <span class="tutu-theme-preview-swatch cream"></span>
            <span>奶油</span>
        </button>

        <button
            type="button"
            class="tutu-theme-preview"
            data-theme="neumorphic">
            <span class="tutu-theme-preview-swatch neumorphic"></span>
            <span>拟态</span>
        </button>

        <button
            type="button"
            class="tutu-theme-preview"
            data-theme="editorial">
            <span class="tutu-theme-preview-swatch editorial"></span>
            <span>编辑部</span>
        </button>
<button
    type="button"
    class="tutu-theme-preview"
    data-theme="polaroid">
    <span class="tutu-theme-preview-swatch polaroid"></span>
    <span>拍立得</span>
</button>
        <button
            type="button"
            class="tutu-theme-preview"
            data-theme="archive">
            <span class="tutu-theme-preview-swatch archive"></span>
            <span>档案</span>
        </button>
    </div>

    <div
        id="tutu_ui_custom_css_box"
        class="tutu-ui-custom-css-box"
        style="display:none;">

        <label
            class="tutu-settings-label"
            for="tutu_ui_custom_css">
            自定义 CSS
        </label>
<input
    id="tutu_manager_style_name"
    class="text_pole"
    placeholder="管理器样式名称">

<select
    id="tutu_manager_style_preset"
    class="text_pole">
    <option value="">选择已保存样式</option>
</select>

        <textarea
            id="tutu_ui_custom_css"
            class="text_pole tutu-ui-custom-css"
            rows="12"
            spellcheck="false"
            placeholder="#tutu_theater_panel {
    background: #202124;
}

#tutu_theater_panel .tutu-icon-toolbar {
    border-bottom: 2px solid #ff6688;
}

#tutu_theater_panel .tutu-icon-action {
    border-radius: 4px;
}"></textarea>

        <div class="tutu-appearance-actions">
            <button
                type="button"
                id="tutu_apply_custom_css_btn"
                class="menu_button">
                <i class="fa-solid fa-check"></i>
                应用 CSS
            </button>

            <button
                type="button"
                id="tutu_reset_custom_css_btn"
                class="menu_button">
                <i class="fa-solid fa-rotate-left"></i>
                清空
            </button>
                <button
        type="button"
        id="tutu_save_manager_style_btn"
        class="menu_button">
        <i class="fa-solid fa-floppy-disk"></i>
        保存样式
    </button>

    <button
        type="button"
        id="tutu_delete_manager_style_btn"
        class="menu_button">
        <i class="fa-solid fa-trash"></i>
        删除样式
    </button>

    <!-- 在这里添加样式导入导出 -->
    <div class="tutu-appearance-actions">
        <button
            type="button"
            id="tutu_export_styles_btn"
            class="menu_button">
            <i class="fa-solid fa-file-export"></i>
            导出全部样式
        </button>

        <button
            type="button"
            id="tutu_import_styles_btn"
            class="menu_button">
            <i class="fa-solid fa-file-import"></i>
            导入样式
        </button>

        <input
            id="tutu_import_styles_file"
            type="file"
            accept=".json,application/json"
            style="display:none;">
    </div>
</div>
        </div>

        <div class="tutu-api-help">
            自定义样式会保存在浏览器中。建议所有选择器以
            <code>#tutu_theater_panel</code> 开头，避免影响酒馆其他界面。
        </div>
    </div>
</div>
        <div class="tutu-typography-manager">
            <div class="tutu-settings-title">
                <i class="fa-solid fa-font"></i>
                排版美化（纯文字小剧场）
            </div>

            <label class="tutu-history-option">
                <input type="checkbox" id="tutu_typo_enabled">
                <span>启用排版美化</span>
            </label>

            <div class="tutu-typo-grid">
                <label class="tutu-settings-label" for="tutu_typo_font_size">字号（px）</label>
                <input id="tutu_typo_font_size" class="text_pole" type="number" min="10" max="40" step="1">

                <label class="tutu-settings-label" for="tutu_typo_line_height">行距</label>
                <input id="tutu_typo_line_height" class="text_pole" type="number" min="1" max="3" step="0.1">

                <label class="tutu-settings-label" for="tutu_typo_letter_spacing">字间距（px）</label>
                <input id="tutu_typo_letter_spacing" class="text_pole" type="number" min="-1" max="8" step="0.5">

                <label class="tutu-settings-label" for="tutu_typo_paragraph_spacing">段间距（em）</label>
                <input id="tutu_typo_paragraph_spacing" class="text_pole" type="number" min="0" max="3" step="0.1">

                <label class="tutu-settings-label" for="tutu_typo_text_indent">首行缩进（字）</label>
                <input id="tutu_typo_text_indent" class="text_pole" type="number" min="0" max="4" step="1" placeholder="0 = 不缩进，2 = 空两格">

                <label class="tutu-settings-label" for="tutu_typo_max_width">整体宽度（px）</label>
                <input id="tutu_typo_max_width" class="text_pole" type="number" min="0" max="2000" step="10" placeholder="0 = 不限，铺满">

                <label class="tutu-settings-label" for="tutu_typo_padding">上下内边距（px）</label>
                <input id="tutu_typo_padding" class="text_pole" type="number" min="0" max="60" step="1">

                <label class="tutu-settings-label" for="tutu_typo_padding_x">左右边距（px）</label>
                <input id="tutu_typo_padding_x" class="text_pole" type="number" min="0" max="80" step="1">

                <label class="tutu-settings-label" for="tutu_typo_font_preset">字体</label>
                <select id="tutu_typo_font_preset" class="text_pole">
                    <option value="inherit">跟随酒馆</option>
                    <option value="serif">宋体 / 衬线</option>
                    <option value="sans">黑体 / 无衬线</option>
                    <option value="kai">楷体 / 霞鹜文楷</option>
                    <option value="fangsong">仿宋</option>
                    <option value="round">圆体</option>
                    <option value="mono">等宽</option>
                    <option value="custom">自定义字体</option>
                </select>

                <label class="tutu-settings-label" for="tutu_typo_font_family">自定义字体名</label>
                <input id="tutu_typo_font_family" class="text_pole" type="text" placeholder="例如：LXGW WenKai（填写后优先使用）">

                <label class="tutu-settings-label" for="tutu_typo_font_url">字体链接（可选）</label>
                <input id="tutu_typo_font_url" class="text_pole" type="text" placeholder="字体文件 .woff2/.ttf，或 Google Fonts 等 CSS 链接">

                <label class="tutu-settings-label" for="tutu_typo_text_color">文字颜色</label>
                <div class="tutu-typo-color-row">
                    <input id="tutu_typo_text_color_picker" type="color" value="#333333" aria-label="选择文字颜色">
                    <input id="tutu_typo_text_color" class="text_pole" type="text" placeholder="留空跟随主题，如 #4a3b32">
                </div>

                <label class="tutu-settings-label" for="tutu_typo_bg_color">背景颜色</label>
                <div class="tutu-typo-color-row">
                    <input id="tutu_typo_bg_color_picker" type="color" value="#fffaf2" aria-label="选择背景颜色">
                    <input id="tutu_typo_bg_color" class="text_pole" type="text" placeholder="留空不改，可填 rgba(255,250,240,.9)">
                </div>

                <label class="tutu-settings-label" for="tutu_typo_bg_image">背景图片链接</label>
                <input id="tutu_typo_bg_image" class="text_pole" type="text" placeholder="https://...（铺满居中）">

                <label class="tutu-settings-label" for="tutu_typo_quote_color">高亮 / 首字颜色</label>
                <div class="tutu-typo-color-row">
                    <input id="tutu_typo_quote_color_picker" type="color" value="#c96f4a" aria-label="选择引号高亮颜色">
                    <input id="tutu_typo_quote_color" class="text_pole" type="text" placeholder="#c96f4a">
                </div>
            </div>

            <div class="tutu-typo-switches">
                <label class="tutu-history-option">
                    <input type="checkbox" id="tutu_typo_quote_highlight">
                    <span>引号高亮（“……”「……」里的话换色）</span>
                </label>
                <label class="tutu-history-option">
                    <input type="checkbox" id="tutu_typo_drop_cap">
                    <span>首字放大</span>
                </label>
                <label class="tutu-history-option">
                    <input type="checkbox" id="tutu_typo_chat_bubble">
                    <span>微信聊天自动渲染成气泡</span>
                </label>
                <label class="tutu-history-option">
                    <input type="checkbox" id="tutu_typo_dialogue_block">
                    <span>对话排版：名字 ▌ 下一行台词</span>
                </label>
            </div>

            <div class="tutu-typo-preset-row">
                <label class="tutu-settings-label" for="tutu_typo_preset_select">排版预设</label>
                <select id="tutu_typo_preset_select" class="text_pole">
                    <option value="">选择预设套用……</option>
                </select>
                <button type="button" id="tutu_typo_preset_save_btn" class="menu_button" title="把当前排版保存为预设">
                    <i class="fa-solid fa-floppy-disk"></i>
                    保存预设
                </button>
                <button type="button" id="tutu_typo_preset_delete_btn" class="menu_button" title="删除选中的预设">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>

            <div class="tutu-appearance-actions">
                <button type="button" id="tutu_typo_reset_btn" class="menu_button">
                    <i class="fa-solid fa-rotate-left"></i>
                    恢复默认排版
                </button>
            </div>

            <div class="tutu-api-help">
                只作用于纯文本（txt）小剧场，HTML 小剧场单独一类、保持原样。
                范围：面板预览、嵌入楼层、捕捉标签、收藏、全屏查看。
                改动立即生效并自动保存；源码、导出和发给 AI 的内容不变。
            </div>
        </div>

        <div class="tutu-render-manager">
            <div class="tutu-settings-title">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                小剧场渲染（正则 / CSS）
            </div>

            <label class="tutu-history-option">
                <input type="checkbox" id="tutu_render_regex_enabled">
                <span>启用渲染正则</span>
            </label>

            <div class="tutu-render-subtitle">正则分组</div>

            <div id="tutu_render_group_list" class="tutu-render-list"></div>

            <div class="tutu-render-inline">
                <input
                    id="tutu_render_group_name"
                    class="text_pole"
                    placeholder="新分组名称">
                <button
                    type="button"
                    id="tutu_render_group_add_btn"
                    class="menu_button">
                    <i class="fa-solid fa-folder-plus"></i>
                    新建分组
                </button>
            </div>

            <div class="tutu-render-subtitle">渲染正则</div>

            <div id="tutu_render_regex_list" class="tutu-render-list"></div>

            <div id="tutu_render_bind_panel" class="tutu-render-bind-panel" style="display:none;">
                <div class="tutu-render-bind-title"></div>
                <input
                    class="text_pole tutu-render-bind-search"
                    placeholder="搜索剧本名称 / 分类">
                <div class="tutu-render-bind-options"></div>
                <div class="tutu-appearance-actions">
                    <button type="button" class="menu_button tutu-render-bind-save">
                        <i class="fa-solid fa-check"></i>
                        保存绑定
                    </button>
                    <button type="button" class="menu_button tutu-render-bind-clear">
                        <i class="fa-solid fa-globe"></i>
                        解除绑定
                    </button>
                    <button type="button" class="menu_button tutu-render-bind-cancel">
                        取消
                    </button>
                </div>
                <div class="tutu-api-help">
                    绑定后只在这些剧本生成的小剧场上生效；不绑定则全局生效。
                    正则单独绑定优先于分组绑定。手动输入、未匹配到剧本的情境不会触发绑定规则。
                </div>
            </div>

            <label class="tutu-history-option">
                <input type="checkbox" id="tutu_render_css_enabled">
                <span>启用渲染 CSS</span>
            </label>

            <div class="tutu-appearance-actions">
                <button
                    type="button"
                    id="tutu_render_autofit_btn"
                    class="menu_button"
                    title="添加内置 CSS：夺舍所有标签的固定宽高，并让小剧场高度随内容自动调整">
                    <i class="fa-solid fa-up-right-and-down-left-from-center"></i>
                    一键自适应（标签夺舍）
                </button>
            </div>

            <label class="tutu-history-option">
                <input type="checkbox" id="tutu_render_anti_clip">
                <span>内置防截断（高度随内容自动撑开，解除 CSS 的固定高度 / 隐藏溢出）</span>
            </label>

            <div id="tutu_render_css_list" class="tutu-render-list"></div>

            <input
                id="tutu_render_css_name"
                class="text_pole"
                placeholder="CSS 名称">

            <textarea
                id="tutu_render_css_input"
                class="text_pole tutu-ui-custom-css"
                rows="6"
                spellcheck="false"
                placeholder="直接写 CSS，或粘贴含 &lt;style&gt; 的内容，会注入到小剧场内部"></textarea>

            <div class="tutu-appearance-actions">
                <button
                    type="button"
                    id="tutu_render_css_add_btn"
                    class="menu_button">
                    <i class="fa-solid fa-plus"></i>
                    添加 CSS
                </button>
            </div>

            <div class="tutu-api-help">
                渲染正则和 CSS 只影响小剧场的显示（面板预览、嵌入楼层、全屏、收藏），
                源码、导出和发给 AI 的内容保持原样。
                预设正则可在“导入”页选择“预设绑定正则”导入；
                预设或世界书里的 CSS 条目可选择“导入为渲染 CSS”。
                “一键自适应”会强制覆盖内容里的固定宽度 / 满屏高度，并让嵌入楼层、面板预览、收藏的高度随内容伸缩。
            </div>
        </div>

        <div class="tutu-settings-title">
            <i class="fa-solid fa-code"></i>
            HTML 生成要求
        </div>

        <div class="tutu-api-help">
            生成区选「HTML」时发给 AI 的格式要求。内置版本已包含：单文件 HTML/CSS/JS、手机与电脑分别排版、
            手机常见手势交互、图片合法来源且禁用真人、风格贴合设定、iframe 运行限制。
            留空或点「恢复内置」即使用内置版本；用户当前设备会自动附在后面。
        </div>

        <textarea
            id="tutu_html_prompt"
            class="text_pole tutu-html-prompt"
            rows="8"
            placeholder="留空使用内置 HTML 生成要求"></textarea>

        <div class="tutu-appearance-actions">
            <button type="button" id="tutu_html_prompt_view_btn" class="menu_button">
                <i class="fa-solid fa-eye"></i>
                载入内置版本编辑
            </button>
            <button type="button" id="tutu_html_prompt_reset_btn" class="menu_button">
                <i class="fa-solid fa-rotate-left"></i>
                恢复内置
            </button>
        </div>

        <div class="tutu-settings-title">
            <i class="fa-solid fa-robot"></i>
            小剧场生成 API
        </div>
<label class="tutu-settings-label">
    输出方式
</label>

<select id="tutu_output_mode" class="text_pole">
    <option value="panel">
        在克制放映室面板内预览
    </option>
    <option value="embed">
        嵌入到最新 AI 回复楼层底部
    </option>
</select>
<label class="tutu-settings-label">
    嵌入楼层默认状态
</label>


<select id="tutu_embed_default_state" class="text_pole">
    <option value="expanded">
        默认展开
    </option>
    <option value="collapsed">
        默认折叠
    </option>
</select>

<div class="tutu-api-help">
    仅对“嵌入到最新 AI 回复楼层底部”生效。
    嵌入后仍然可以点击标题手动展开或折叠。
</div>

<div class="tutu-api-help">
    <strong>面板预览</strong>：生成内容只在小剧场面板中显示。<br>
    <strong>嵌入楼层</strong>：生成内容会附加到最新 AI 回复的底部，
    切换聊天也不会消失。
    AI 不会读取到嵌入的小剧场内容（通过正则自动过滤）。
</div>
<label class="tutu-settings-label">
    自定义捕捉标签
</label>

<input
    id="tutu_capture_tag_name"
    class="text_pole"
    type="text"
    placeholder="例如：details"
>

<div class="tutu-api-help">
    填写一个 HTML 标签名（例如 <code>details</code>），
    插件会自动捕捉 AI 回复中所有该标签包裹的内容，
    为它们添加小剧场操作按钮（收藏、导出、全屏查看）。
    <br>
    留空表示不捕捉。多个标签用英文逗号分隔，例如：
    <code>details, blockquote</code>
</div>

        <label class="tutu-settings-label">
            生成方式
        </label>

        <select id="tutu_api_provider" class="text_pole">
            <option value="main">使用酒馆主 API</option>
            <option value="secondary">使用自定义副 API</option>
        </select>

        <div id="tutu_secondary_api_settings">

<label class="tutu-settings-label">
    副 API 地址
</label>

<input
    id="tutu_secondary_endpoint"
    class="text_pole"
    type="text"
    placeholder="例如：https://api.openai.com/v1"
>

<div class="tutu-api-help">
    这里只需要填写到 <code>/v1</code>。
    程序会自动请求：
    <code>/v1/chat/completions</code>
</div>


            <label class="tutu-settings-label">
                API Key
            </label>

            <input
                id="tutu_secondary_api_key"
                class="text_pole"
                type="password"
                placeholder="sk-..."
            >

<label class="tutu-settings-label">
    模型
</label>

<div class="tutu-model-select-row">
    <select
        id="tutu_secondary_model"
        class="text_pole">
        <option value="">请先拉取模型</option>
    </select>

    <div
        id="tutu_fetch_models_btn"
        class="menu_button margin0"
        title="从副 API 拉取模型">
        <i class="fa-solid fa-rotate"></i>
        拉取模型
    </div>
</div>


            <label class="tutu-settings-label" for="tutu_secondary_max_tokens">
                最大输出长度（tokens）
            </label>

            <div class="tutu-max-tokens-row">
                <input
                    id="tutu_secondary_max_tokens"
                    class="text_pole"
                    type="number"
                    min="0"
                    max="200000"
                    step="256"
                    inputmode="numeric"
                    placeholder="留空 = 不发送，用接口默认值">
                <div class="tutu-max-tokens-presets" role="group" aria-label="快捷填入">
                    <button type="button" class="menu_button margin0 tutu-max-tokens-preset" data-value="4096">4K</button>
                    <button type="button" class="menu_button margin0 tutu-max-tokens-preset" data-value="8192">8K</button>
                    <button type="button" class="menu_button margin0 tutu-max-tokens-preset" data-value="16384">16K</button>
                    <button type="button" class="menu_button margin0 tutu-max-tokens-preset" data-value="">清空</button>
                </div>
            </div>

            <div class="tutu-api-help">
                作为 <code>max_tokens</code> 发送。纯文本 4K 左右够用，HTML 建议 8K–16K；
                不能超过模型本身的输出上限，否则接口会报错。只对副 API 生效，主 API 的长度在酒馆「回复长度」里调。
            </div>

            <div class="tutu-api-help">
                副 API 需要兼容 OpenAI Chat Completions 格式。
                请求格式为：
                <code>/v1/chat/completions</code>
            </div>

            <div class="tutu-api-preset-row">
                <select id="tutu_api_preset_select" class="text_pole">
                    <option value="">选择已保存的副 API 预设</option>
                </select>

                <div
                    id="tutu_load_api_preset_btn"
                    class="menu_button margin0">
                    载入
                </div>
            </div>

            <div class="tutu-api-preset-row">
                <input
                    id="tutu_api_preset_name"
                    class="text_pole"
                    type="text"
                    placeholder="预设名称，例如：OpenAI"
                >

                <div
                    id="tutu_save_api_preset_btn"
                    class="menu_button margin0">
                    保存预设
                </div>

                <div
                    id="tutu_delete_api_preset_btn"
                    class="menu_button margin0">
                    删除预设
                </div>
            </div>

        </div>
<div class="tutu-settings-section tutu-aux-prompt-section">

    <div class="tutu-settings-title">
        <i class="fa-solid fa-feather-pointed"></i>
        破限 / 文风 / 附加
    </div>

    <label class="tutu-switch-row tutu-aux-master-switch">
        <input
            type="checkbox"
            id="tutu_aux_prompts_enabled">

        <span>
            启用破限、文风与附加提示词
        </span>
    </label>

    <div
        id="tutu_aux_prompt_settings_body"
        class="tutu-aux-prompt-settings-body"
        style="display:none;">

        <div class="tutu-api-help">
            三类都可以多选，也可以都不选。生成时按勾选顺序拼进提示词；
            「附加」适合放禁词、字数、格式等要求，可从预设里直接导入。
        </div>

        <div class="tutu-aux-active-selects">

            <div class="tutu-aux-active-item">
                <label class="tutu-settings-label">
                    当前启用的破限
                    <span class="tutu-aux-active-count" data-type="jailbreak"></span>
                </label>
                <div class="tutu-aux-checklist" data-type="jailbreak"></div>
            </div>

            <div class="tutu-aux-active-item">
                <label class="tutu-settings-label">
                    当前启用的文风
                    <span class="tutu-aux-active-count" data-type="style"></span>
                </label>
                <div class="tutu-aux-checklist" data-type="style"></div>
            </div>

            <div class="tutu-aux-active-item">
                <label class="tutu-settings-label">
                    当前启用的附加
                    <span class="tutu-aux-active-count" data-type="extra"></span>
                </label>
                <div class="tutu-aux-checklist" data-type="extra"></div>
            </div>

        </div>

        <details
            id="tutu_aux_prompt_editor_details"
            class="tutu-aux-editor-details">

            <summary class="tutu-aux-editor-summary">
                <span>
                    <i class="fa-solid fa-pen-to-square"></i>
                    管理已保存的破限 / 文风 / 附加
                </span>

                <i class="fa-solid fa-chevron-down tutu-aux-editor-arrow"></i>
            </summary>

            <div class="tutu-aux-editor">

                <label class="tutu-settings-label">
                    编辑类型
                </label>

                <select
                    id="tutu_aux_prompt_type"
                    class="text_pole">

                    <option value="jailbreak">
                        破限提示词
                    </option>

                    <option value="style">
                        文风提示词
                    </option>

                    <option value="extra">
                        附加提示词（禁词等）
                    </option>
                </select>

                <label class="tutu-settings-label">
                    已保存条目
                </label>

                <select
                    id="tutu_aux_prompt_preset"
                    class="text_pole">

                    <option value="">
                        新建提示词
                    </option>
                </select>

                <div
                    id="tutu_aux_edit_status"
                    class="tutu-aux-edit-status">
                    当前正在新建提示词
                </div>

                <label class="tutu-settings-label">
                    名称
                </label>

                <input
                    id="tutu_aux_prompt_name"
                    class="text_pole"
                    type="text"
                    placeholder="例如：通用破限、细腻文风、禁词表">

                <label class="tutu-settings-label">
                    提示词正文
                </label>

                <textarea
                    id="tutu_aux_prompt_content"
                    class="text_pole tutu-aux-prompt-content"
                    rows="8"
                    placeholder="请输入破限、文风或附加提示词……"></textarea>

                <div class="tutu-appearance-actions">

                    <button
                        type="button"
                        id="tutu_new_aux_prompt_btn"
                        class="menu_button">

                        <i class="fa-solid fa-plus"></i>
                        新建
                    </button>

                    <button
                        type="button"
                        id="tutu_save_aux_prompt_btn"
                        class="menu_button">

                        <i class="fa-solid fa-floppy-disk"></i>

                        <span id="tutu_save_aux_prompt_btn_text">
                            保存新提示词
                        </span>
                    </button>

                    <button
                        type="button"
                        id="tutu_delete_aux_prompt_btn"
                        class="menu_button">

                        <i class="fa-solid fa-trash"></i>
                        删除
                    </button>

                </div>

            </div>
        </details>

    </div>
</div>
<div class="tutu-settings-section tutu-auto-generation-section">

    <div class="tutu-settings-title">
        <i class="fa-solid fa-bolt"></i>
        自动生成小剧场
    </div>

    <label class="tutu-switch-row">
        <input
            type="checkbox"
            id="tutu_auto_generate_enabled">

        <span>
            收到最新 AI 回复后自动生成
        </span>
    </label>

<label class="tutu-settings-label">
    自动生成方式
</label>

<select id="tutu_auto_generate_mode" class="text_pole">
    <option value="current">
        使用当前输入框情境
    </option>
    <option value="random">
        从剧本库随机生成
    </option>
    <option value="sequence">
        从剧本库顺序生成
    </option>
</select>

<label class="tutu-settings-label">
    自动生成剧本范围
</label>

<select id="tutu_auto_generate_scope" class="text_pole">
    <option value="all">
        使用全部剧本
    </option>
    <option value="category">
        使用指定分类
    </option>
</select>

<select
    id="tutu_auto_generate_category"
    class="text_pole">
    <option value="">请选择分类</option>
</select>

    <label class="tutu-settings-label">
        自动生成使用的 API
    </label>

    <div class="tutu-auto-api-tip">
        自动生成会使用上方已经保存的 API 设置。
    </div>

</div>
        <div
            id="tutu_save_settings_btn"
            class="menu_button">
            <i class="fa-solid fa-save"></i>
            保存设置
        </div>
    </div>
<!-- TAB 5: 我的收藏 -->
<div id="tutu_tab_favorites" class="tutu-tab-content">

    <div class="tutu-favorite-toolbar">
        <div class="tutu-library-title">
            <i class="fa-solid fa-heart"></i>
            我的收藏
        </div>

        <div
            id="tutu_clear_favorites_btn"
            class="menu_button margin0">
            <i class="fa-solid fa-trash"></i>
            清空收藏
        </div>
    </div>

    <div
        id="tutu_favorites_list"
        class="tutu-favorites-list">
    </div>

</div>



        </div>
    `;

    $('body').append(panelHtml);

// 强制将面板挂到 body 直属层级，避免被 SillyTavern 的容器遮挡
const tutuPanel = document.getElementById('tutu_theater_panel');

if (tutuPanel && tutuPanel.parentElement !== document.body) {
    document.body.appendChild(tutuPanel);
}

/*
 * 启动时强制隐藏面板，只有点击菜单「克制放映室」才打开。
 * 避免主题 / 自定义 CSS 里的 display 覆盖默认隐藏，导致每次启动都弹出。
 */
if (tutuPanel) {
    tutuPanel.style.cssText = 'display:none;';
    tutuPanel.classList.remove('tutu-mobile-mode');
}


    // ==========================================
    // 3. 核心逻辑函数
    // ==========================================
function updatePresetFileDropdown() {
    // 'worldbook'、'openai' 或 'openai_regex'（后两者都使用对话补全预设列表）
    const type = $('#tutu_preset_type').val();
    const $fileSelect = $('#tutu_preset_file');

    $fileSelect.empty();

    if (type === 'worldbook') {
        // 读取 SillyTavern 的世界书列表
        const worldBooks = Array.isArray(world_names) ? world_names : [];

        if (worldBooks.length === 0) {
            $fileSelect.append(
                $('<option>', {
                    value: '',
                    text: '没有找到世界书'
                })
            );

            $('#tutu_native_prompts_list').html(
                '<div style="text-align:center; padding:20px; opacity:0.7;">没有找到世界书</div>'
            );

            return;
        }

        worldBooks.forEach(worldBookName => {
            $fileSelect.append(
                $('<option>', {
                    value: worldBookName,
                    text: worldBookName
                })
            );
        });

        // 默认选中第一本世界书
        $fileSelect.prop('selectedIndex', 0);

        fetchAndRenderNativePrompts();
        return;
    }

    // 对话补全预设
    const sourceSelector = '#settings_preset_openai';

    $(sourceSelector + ' option').each(function () {
        const val = $(this).val();
        const text = $(this).text().trim();

        // 跳过空选项
        if (text && val !== undefined) {
            $fileSelect.append(
                $('<option>', {
                    value: text,
                    text: text
                })
            );
        }
    });

    // 默认选中当前正在使用的对话补全预设
    const currentActiveName = $(sourceSelector + ' option:selected')
        .text()
        .trim();

    if (currentActiveName) {
        $fileSelect.val(currentActiveName);
    }

    fetchAndRenderNativePrompts();
}

function exportTutuStyles() {
    const data = {
        type: STYLE_PACKAGE_TYPE,
        version: STYLE_PACKAGE_VERSION,
        exportedAt: new Date().toISOString(),
        styles: tutuStyleLibrary,
    };

    downloadTutuBlob(
        new Blob(
            [JSON.stringify(data, null, 2)],
            { type: 'application/json;charset=utf-8' }
        ),
        '克制放映室-样式预设.json'
    );
}
async function importTutuStyles(file) {
    if (file.size > 1024 * 1024) {
        throw new Error('样式文件不能超过 1MB');
    }

    const data = JSON.parse(await file.text());

    if (
        data?.type !== STYLE_PACKAGE_TYPE ||
        !data.styles
    ) {
        throw new Error('这不是克制放映室样式文件');
    }

    const imported =
        normalizeTutuStyleLibrary(data.styles);

    for (const target of ['manager', 'embed', 'quote']) {
        imported[target].forEach(item => {
            const oldIndex = tutuStyleLibrary[target]
                .findIndex(old => old.id === item.id);

            if (oldIndex >= 0) {
                tutuStyleLibrary[target][oldIndex] = item;
            } else {
                tutuStyleLibrary[target].push(item);
            }
        });
    }

    saveTutuStyleLibrary();
    renderTutuStylePresetSelects();
}


function switchTutuTab(tabId) {
    $('.tutu-icon-tab').removeClass('active');
    $('.tutu-tab-content').removeClass('active');

    $(`.tutu-icon-tab[data-tab="${tabId}"]`)
        .addClass('active');

    $(`#${tabId}`)
        .addClass('active');

    if (tabId === 'tutu_tab_favorites') {
        renderTutuFavorites();
    }
}


$(document).on('click', '.tutu-icon-tab', function () {
    switchTutuTab($(this).data('tab'));
});

function getTutuCharacterStorageKey(character, context) {
    /*
     * characterId 在大多数情况下可以区分角色。
     * 同时加入角色头像和名称，避免某些版本中的 ID 冲突。
     */
    const characterId =
        context?.characterId !== undefined
            ? String(context.characterId)
            : 'none';

    const avatar =
        character?.avatar ||
        character?.data?.avatar ||
        '';

    const name =
        character?.name ||
        character?.data?.name ||
        'AI';

    return `${characterId}::${avatar}::${name}`;
}

function getCurrentTutuCharacterStorage() {
    const context = SillyTavern.getContext();

    const character =
        context.characterId !== undefined &&
        context.characters?.[context.characterId]
            ? context.characters[context.characterId]
            : null;

    const key = getTutuCharacterStorageKey(character, context);

    if (!tutuCharacterContexts[key]) {
        /*
         * 新角色沿用上一次的全局默认（读取历史 / 条数），
         * 不再每次都回到「不读取」。
         */
        tutuCharacterContexts[key] = {
            selectedWorldEntries: [],
            includeHistory: Boolean(tutuSettings.historyIncludeEnabled),
            historyLimit: Number(tutuSettings.historyLimitDefault) || 20,
        };
    }

    return {
        context,
        character,
        key,
        settings: tutuCharacterContexts[key],
    };
}

function saveCurrentTutuCharacterStorage(settings) {
    const current = getCurrentTutuCharacterStorage();

    tutuCharacterContexts[current.key] = {
        selectedWorldEntries: Array.isArray(settings.selectedWorldEntries)
            ? settings.selectedWorldEntries
            : [],

        includeHistory: Boolean(settings.includeHistory),

        historyLimit:
            Number(settings.historyLimit) > 0
                ? Number(settings.historyLimit)
                : 20,
    };

    localStorage.setItem(
        CHARACTER_CONTEXT_KEY,
        JSON.stringify(tutuCharacterContexts)
    );

    // 同步为全局默认，新角色 / 下次打开直接沿用
    tutuSettings.historyIncludeEnabled =
        tutuCharacterContexts[current.key].includeHistory;
    tutuSettings.historyLimitDefault =
        tutuCharacterContexts[current.key].historyLimit;
    persistTutuSettings();
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
/**
 * 尽可能提取 API 返回的详细错误原因
 */
function getTutuErrorMessage(error) {
    if (!error) {
        return '未知错误';
    }

    // 普通 Error
    if (error instanceof Error && error.message) {
        return String(error.message).trim();
    }

    // fetch 或自定义 API 可能挂载了 response
    if (error.response) {
        const response = error.response;

        if (typeof response === 'string') {
            return response;
        }

        if (response.data) {
            try {
                return JSON.stringify(response.data, null, 2);
            } catch {
                return String(response.data);
            }
        }

        if (response.status || response.statusText) {
            return [
                response.status
                    ? `HTTP ${response.status}`
                    : '',
                response.statusText || '',
            ]
                .filter(Boolean)
                .join(' ');
        }
    }

    // 自定义错误对象可能有 responseText
    if (error.responseText) {
        return String(error.responseText);
    }

    // OpenAI 兼容接口常见错误格式
    if (error.error) {
        if (typeof error.error === 'string') {
            return error.error;
        }

        try {
            return JSON.stringify(error.error, null, 2);
        } catch {
            return String(error.error);
        }
    }

    if (typeof error === 'string') {
        return error;
    }

    try {
        return JSON.stringify(error, null, 2);
    } catch {
        return String(error);
    }
}

function isProbablyHtml(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    const value = text.trim();

    return (
        /^<!doctype html/i.test(value) ||
        /^<html[\s>]/i.test(value) ||
        /<(div|section|article|main|body|style|table|h1|h2|h3|p|img|button|form|script|svg|header|footer|nav|ul|ol)[\s>]/i.test(value)
    );
}

/**
 * HTML 模式：去掉 AI 在文档前后加的说明文字，只保留 <!DOCTYPE html> … </html>。
 * 找不到完整文档时原样返回。
 */
function extractTutuHtmlDocument(text) {
    const value = String(text || '');
    const start = value.search(/<!doctype html|<html[\s>]/i);

    if (start < 0) return value.trim();

    const endMatch = value.match(/<\/html\s*>(?![\s\S]*<\/html\s*>)/i);
    const end = endMatch ? endMatch.index + endMatch[0].length : value.length;

    return value.slice(start, end).trim();
}
function cleanGeneratedContent(content) {
    let text = String(content || '').trim();

    if (!text) {
        return '';
    }

    /*
     * 去除开头可能存在的说明文字。
     *
     * 只有当内容中确实存在代码围栏时才处理，
     * 避免误删普通文字。
     */
    const fencedMatch = text.match(
        /```(?:html|HTML|xml|XML)?\s*([\s\S]*?)```/
    );

    if (fencedMatch) {
        text = fencedMatch[1].trim();
    } else {
        /*
         * 没有完整代码围栏时，单独清除首尾围栏。
         */
        text = text
            .replace(/^\s*```(?:html|HTML|xml|XML)?\s*\r?\n?/, '')
            .replace(/\r?\n?\s*```\s*$/, '')
            .trim();
    }

    return text;
}
function updateTutuFavoriteButtonState() {
    const content =
        String(tutuCurrentResultContent || '').trim();

    const $button = $('#tutu_favorite_current_btn');

    if (!$button.length) {
        return;
    }

    if (!content) {
        $button.removeClass('active');

        $button.find('i')
            .attr('class', 'fa-regular fa-heart');

        return;
    }

    const favorites = loadTutuFavorites();

const currentCharacterName =
    getCurrentTutuCharacterName();

const isFavorited = favorites.some(item =>
    item.content === content &&
    item.characterName === currentCharacterName
);

    $button.toggleClass('active', isFavorited);

    $button.find('i').attr(
        'class',
        isFavorited
            ? 'fa-solid fa-heart'
            : 'fa-regular fa-heart'
    );
}
function downloadTutuBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}

function sanitizeTutuFilename(name) {
    return String(name || '克制放映室')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || '克制放映室';
}
function exportTutuTextFile(content, characterName) {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('没有可以导出的文字内容');
        return;
    }

    const title = `克制放映室 - ${characterName}`;

    const output = [
        title,
        `角色：${characterName}`,
        `时间：${new Date().toLocaleString()}`,
        '',
        text,
    ].join('\n');

    const blob = new Blob(
        [output],
        {
            type: 'text/plain;charset=utf-8',
        }
    );

    const filename =
        `${sanitizeTutuFilename(title)}.txt`;

    downloadTutuBlob(blob, filename);

    toastr.success('纯文本已导出');
}
function getTutuQuoteStyle(styleName) {
    const styles = {
        minimalist: {
            name: '🌸 极简杂志', type: 'canvas',
            font: '"Noto Serif SC", "Source Han Serif SC", serif', renderMode: 'minimalist'
        },
        social: {
            name: '📱 社交动态', type: 'canvas',
            font: '"Helvetica Neue", Helvetica, "PingFang SC", "Microsoft YaHei", sans-serif', renderMode: 'social'
        },
        ancient: {
            name: '📜 古风稿纸', type: 'canvas',
            font: '"Kaiti SC", "STKaiti", "Noto Serif SC", serif', renderMode: 'ancient'
        },
        letter: {
            name: '💌 温馨信笺', type: 'canvas',
            font: '"Kaiti SC", "STKaiti", "Noto Serif SC", serif', renderMode: 'letter'
        },
        aurora: {
            name: '🌌 极光玻璃', type: 'canvas',
            font: '"Helvetica Neue", Helvetica, "PingFang SC", "Noto Sans SC", sans-serif', renderMode: 'aurora'
        },
        custom_css: {
            name: '🎨 自定义 CSS', type: 'html', renderMode: 'custom_css'
        },
    };
    return styles[styleName] || styles.minimalist;
}

function getAllTutuQuoteStyles() {
    const styleNames = ['minimalist', 'social', 'ancient', 'letter', 'aurora', 'custom_css'];
    return styleNames.map(name => ({
        value: name,
        ...getTutuQuoteStyle(name),
    }));
}







async function exportTutuQuoteImage(
    content,
    characterName,
    styleName = 'classic',
    options = {}
) {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('没有可以导出的文字内容');
        return;
    }

    const style = getTutuQuoteStyle(styleName);

    // 如果是自定义 CSS 书摘，使用 HTML 导出
    if (style.type === 'html' || styleName === 'custom_css') {
        await exportTutuCustomCssQuote(text, characterName, options);
        return;
    }

    const fontSize = Number(options.fontSize) || 32;
    const lineHeightRatio = Number(options.lineHeight) || 1.8;
    const lineHeight = Math.round(fontSize * lineHeightRatio);
    const textIndent = Number(options.textIndent) || 0;
    const textAlign = options.textAlign || 'left';
    const paddingH = Number(options.paddingH) || 90;
    const paddingV = Number(options.paddingV) || 90;
    const imageWidth = Number(options.imageWidth) || 1200;
    const showDate = options.showDate !== false;
    const showQuoteMark = options.showQuoteMark !== false;
    const showDecoLine = options.showDecoLine !== false;
    const titleText = String(options.titleText || '克制放映室').trim();
    const subtitleText = String(
        options.subtitleText || `来自：${characterName}`
    ).trim();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = imageWidth;
    const contentWidth = width - paddingH * 2;

    ctx.font = `${fontSize}px ${style.font}`;

    const lines = wrapTutuCanvasText(ctx, text, contentWidth, textIndent);
    const bodyHeight = lines.length * lineHeight;

    const headerHeight = 160;
    const footerHeight = showDate ? 100 : 50;

    const height = Math.max(
        600,
        paddingV + headerHeight + bodyHeight + footerHeight + paddingV
    );

    canvas.width = width;
    canvas.height = height;

    // 使用统一渲染接口
    renderQuoteStyle(ctx, {
        style,
        width,
        height,
        contentWidth: width - paddingH * 2,
        paddingH,
        paddingV,
        text,
        lines,
        lineHeight,
        fontSize: options.fontSize,
        textAlign: options.textAlign,
        titleText: options.titleText,
        subtitleText: options.subtitleText,
        showDate: options.showDate,
        showQuoteMark: options.showQuoteMark,
        showDecoLine: options.showDecoLine,
        characterName: tutuQuoteEditorCharacter,
    });


    return new Promise((resolve) => {
        canvas.toBlob(blob => {
            if (!blob) {
                toastr.error('生成书摘图片失败');
                resolve();
                return;
            }

            const filename =
                `${sanitizeTutuFilename(
                    `克制放映室-${characterName}`
                )}.png`;

            downloadTutuBlob(blob, filename);

            toastr.success('书摘图片已导出');
            resolve();
        }, 'image/png');
    });
}

// 文本换行辅助函数
function wrapTutuCanvasText(ctx, text, maxWidth, textIndent = 0) {
    const lines = [];
    const paragraphs = String(text || '').split(/\r?\n/);
    const indent = textIndent > 0 ? '\u3000'.repeat(textIndent) : '';

    paragraphs.forEach(paragraph => {
        if (!paragraph.trim()) {
            lines.push('');
            return;
        }

        let currentLine = '';
        const fullText = indent ? indent + paragraph : paragraph;

        for (const char of fullText) {
            const testLine = currentLine + char;
            if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = char;
            } else {
                currentLine = testLine;
            }
        }

        if (currentLine) lines.push(currentLine);
    });

    return lines;
}


// 1. 🌸 极简杂志风（大面积留白，巨大的装饰引号，高级感）
function renderMinimalistStyle(ctx, params) {
    const { width, height, paddingH, paddingV, lines, lineHeight, fontSize, titleText, subtitleText, showDate } = params;
    
    // 米白色背景
    ctx.fillStyle = '#F9F9F7';
    ctx.fillRect(0, 0, width, height);

    // 背景巨大的装饰引号
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    ctx.font = 'bold 400px Georgia, serif';
    ctx.fillText('“', paddingH - 40, paddingV + 250);

    let currentY = paddingV + 60;

    // 杂志感标题（全大写/加粗）
    ctx.fillStyle = '#1A1A1A';
    ctx.font = `bold 36px ${params.style.font}`;
    ctx.fillText(titleText, paddingH, currentY);
    
    ctx.fillStyle = '#888888';
    ctx.font = `20px ${params.style.font}`;
    ctx.fillText(subtitleText, paddingH, currentY + 40);

    // 分割线
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(paddingH, currentY + 80, 60, 3);

    currentY += 160;

    // 正文排版
    ctx.fillStyle = '#2C2C2C';
    ctx.font = `${fontSize}px ${params.style.font}`;
    ctx.textAlign = params.textAlign;
    
    lines.forEach(line => {
        const x = params.textAlign === 'center' ? width / 2 : paddingH;
        ctx.fillText(line, x, currentY);
        currentY += lineHeight;
    });

    if (showDate) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#AAAAAA';
        ctx.font = `italic 20px ${params.style.font}`;
        ctx.fillText(new Date().toLocaleDateString(), width - paddingH, height - paddingV);
    }
}

// 2. 📱 社交动态风（拟真卡片UI、头像、点赞栏）
function renderSocialStyle(ctx, params) {
    const { width, height, paddingH, lines, lineHeight, fontSize, titleText, subtitleText } = params;

    // 浅灰背景
    ctx.fillStyle = '#F0F2F5';
    ctx.fillRect(0, 0, width, height);

    const cardMargin = paddingH * 0.5;
    const cardW = width - cardMargin * 2;
    const cardH = height - cardMargin * 2;

    // 绘制卡片白底和阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(cardMargin, cardMargin, cardW, cardH, 20);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    let currentY = cardMargin + 60;

    // 画头像圈 (取名字第一个字)
    const avatarX = cardMargin + 50;
    const avatarR = 35;
    ctx.fillStyle = '#6557C7'; // 主题紫
    ctx.beginPath();
    ctx.arc(avatarX, currentY, avatarR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(titleText.charAt(0) || '克', avatarX, currentY + 10);

    // ID 和 时间
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1C1E21';
    ctx.font = `bold 28px ${params.style.font}`;
    ctx.fillText(titleText, avatarX + 50, currentY - 5);
    ctx.fillStyle = '#606770';
    ctx.font = `20px ${params.style.font}`;
    ctx.fillText(`${subtitleText} · 刚刚发布`, avatarX + 50, currentY + 25);

    currentY += 100;

    // 正文
    ctx.fillStyle = '#050505';
    ctx.font = `${fontSize}px ${params.style.font}`;
    const textX = cardMargin + 50;
    lines.forEach(line => {
        ctx.fillText(line, textX, currentY);
        currentY += lineHeight;
    });

    // 底部点赞评论栏
    const footerY = cardMargin + cardH - 40;
    ctx.fillStyle = '#EBEDF0';
    ctx.fillRect(cardMargin + 50, footerY - 40, cardW - 100, 2); // 分割线
    ctx.fillStyle = '#606770';
    ctx.font = '24px sans-serif';
    ctx.fillText('♥ 喜欢   💬 评论   ➦ 分享', textX, footerY + 10);
}


// 4. 📜 古风稿纸（乌丝栏格，红线，楷体）
function renderAncientStyle(ctx, params) {
    const { width, height, paddingH, paddingV, lines, lineHeight, fontSize, titleText } = params;

    // 宣纸底色
    ctx.fillStyle = '#F4EAD5';
    ctx.fillRect(0, 0, width, height);

    const marginX = paddingH;
    const marginY = paddingV;
    const contentW = width - marginX * 2;

    // 绘制红色“乌丝栏”（古代红线稿纸）
    ctx.strokeStyle = '#B33C36';
    ctx.lineWidth = 2;
    // 粗外框
    ctx.strokeRect(marginX - 10, marginY - 10, contentW + 20, height - marginY * 2 + 20);
    ctx.lineWidth = 1;

    let currentY = marginY;

    // 标题红底白字小印章
    ctx.fillStyle = '#B33C36';
    ctx.fillRect(marginX, currentY, 120, 40);
    ctx.fillStyle = '#F4EAD5';
    ctx.font = `bold 22px ${params.style.font}`;
    ctx.textAlign = 'center';
    ctx.fillText(titleText.slice(0,4), marginX + 60, currentY + 28);
    
    currentY += 80;

    // 循环绘制正文和行线
    ctx.textAlign = 'left';
    ctx.font = `${fontSize}px ${params.style.font}`;
    ctx.fillStyle = '#222222';

    lines.forEach(line => {
        // 画红线
        ctx.beginPath();
        ctx.moveTo(marginX, currentY + 10);
        ctx.lineTo(marginX + contentW, currentY + 10);
        ctx.stroke();

        ctx.fillText(line, marginX, currentY - 10);
        currentY += lineHeight;
    });
}

// 统一渲染入口
function renderQuoteStyle(ctx, params) {
    const { style } = params;
    switch (style.renderMode) {
        case 'social': renderSocialStyle(ctx, params); break;
        case 'ancient': renderAncientStyle(ctx, params); break;
        case 'letter': renderLetterStyle(ctx, params); break;
        case 'aurora': renderAuroraStyle(ctx, params); break;
        default: renderMinimalistStyle(ctx, params);
    }
}

// 💌 温馨信笺风（带胶带、纸张阴影和书写横线）
function renderLetterStyle(ctx, params) {
    const { width, height, paddingH, paddingV, lines, lineHeight, fontSize, titleText, subtitleText, showDate } = params;

    // 木质/暖灰桌面背景
    ctx.fillStyle = '#EBE7DF';
    ctx.fillRect(0, 0, width, height);

    const paperX = paddingH * 0.5;
    const paperY = paddingV * 0.5;
    const paperW = width - paperX * 2;
    const paperH = height - paperY * 2;

    // 纸张阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 25;
    ctx.shadowOffsetY = 10;
    
    // 白纸主体
    ctx.fillStyle = '#FDFCF8';
    ctx.fillRect(paperX, paperY, paperW, paperH);
    ctx.shadowColor = 'transparent';

    // 顶部半透明胶带贴纸
    ctx.save();
    ctx.translate(width / 2, paperY);
    ctx.rotate(-0.03); // 微微倾斜
    ctx.fillStyle = 'rgba(215, 195, 180, 0.8)';
    ctx.fillRect(-70, -20, 140, 38);
    ctx.restore();

    let currentY = paperY + 90;

    // 标题区域
    ctx.fillStyle = '#5A4C40';
    ctx.font = `bold ${fontSize + 8}px ${params.style.font}`;
    ctx.textAlign = 'center';
    ctx.fillText(titleText, width / 2, currentY);
    
    currentY += 40;
    ctx.font = `italic ${fontSize - 4}px ${params.style.font}`;
    ctx.fillStyle = '#9C8C7E';
    ctx.fillText(subtitleText, width / 2, currentY);

    currentY += 80;

    // 绘制横线和正文
    ctx.textAlign = params.textAlign === 'center' ? 'center' : 'left';
    ctx.font = `${fontSize}px ${params.style.font}`;
    ctx.fillStyle = '#333333';
    
    const lineStartX = paperX + 50;
    const lineEndX = width - paperX - 50;
    const textStartX = params.textAlign === 'center' ? width / 2 : lineStartX + 10;

    lines.forEach(line => {
        // 画浅色虚线/横线
        ctx.beginPath();
        ctx.moveTo(lineStartX, currentY + 12);
        ctx.lineTo(lineEndX, currentY + 12);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillText(line, textStartX, currentY);
        currentY += lineHeight;
    });

    if (showDate) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#B3A69A';
        ctx.font = `${fontSize - 6}px ${params.style.font}`;
        ctx.fillText(new Date().toLocaleDateString(), lineEndX, height - paperY - 30);
    }
}

// 🌌 极光玻璃风（时下最火的毛玻璃UI，深色高级感）
function renderAuroraStyle(ctx, params) {
    const { width, height, paddingH, paddingV, lines, lineHeight, fontSize, titleText, subtitleText, showDate } = params;

    // 极光渐变背景
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#100C20'); // 深邃紫
    grad.addColorStop(0.5, '#0F2C4C'); // 极光蓝
    grad.addColorStop(1, '#063B3B'); // 暗青色
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 增加几个柔和发光球体，模拟极光光晕
    const drawGlow = (x, y, r, color) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
    };
    drawGlow(width * 0.8, height * 0.2, width * 0.5, 'rgba(120, 80, 255, 0.25)');
    drawGlow(width * 0.2, height * 0.8, width * 0.5, 'rgba(0, 255, 200, 0.15)');

    const glassX = paddingH * 0.5;
    const glassY = paddingV * 0.5;
    const glassW = width - glassX * 2;
    const glassH = height - glassY * 2;

    // 毛玻璃背后的卡片阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;

    // 绘制半透明玻璃主体
    ctx.beginPath();
    ctx.roundRect(glassX, glassY, glassW, glassH, 24);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'; // 半透明白层
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // 绘制玻璃的高光边框
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.stroke();

    let currentY = glassY + 90;
    
    // 文字发光效果
    ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
    ctx.shadowBlur = 12;

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = `bold ${fontSize + 8}px ${params.style.font}`;
    ctx.fillText(titleText, width / 2, currentY);
    
    currentY += 40;
    ctx.font = `${fontSize - 4}px ${params.style.font}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillText(subtitleText, width / 2, currentY);
    
    currentY += 80;

    // 正文
    ctx.textAlign = params.textAlign === 'center' ? 'center' : 'left';
    ctx.font = `${fontSize}px ${params.style.font}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowBlur = 0; // 正文去掉模糊，保证清晰可读
    
    const textStartX = params.textAlign === 'center' ? width / 2 : glassX + 60;
    
    lines.forEach(line => {
        ctx.fillText(line, textStartX, currentY);
        currentY += lineHeight;
    });

    if (showDate) {
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = `${fontSize - 6}px ${params.style.font}`;
        ctx.fillText(new Date().toLocaleDateString(), width - glassX - 40, height - glassY - 30);
    }
}


// ==========================================
// 自定义 CSS 书摘
// ==========================================

async function exportTutuCustomCssQuote(content, characterName, options) {
    const customCss = String(options.customCss || '').trim();

    if (!customCss) {
        toastr.warning('请先输入自定义 CSS 样式');
        return;
    }

    const text = String(content || '').trim();
    const titleText = String(options.titleText || '克制放映室').trim();
    const subtitleText = String(
        options.subtitleText || `来自：${characterName}`
    ).trim();
    const showDate = options.showDate !== false;

    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(titleText)}</title>
<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: "Noto Serif SC", "Source Han Serif SC", serif;
    line-height: 1.8;
}

.quote-container {
    width: ${Number(options.imageWidth) || 1200}px;
    padding: ${Number(options.paddingV) || 90}px ${Number(options.paddingH) || 90}px;
}

.quote-title {
    font-size: 42px;
    font-weight: bold;
    margin-bottom: 10px;
}

.quote-subtitle {
    font-size: 24px;
    margin-bottom: 40px;
}

.quote-content {
    font-size: ${Number(options.fontSize) || 32}px;
    line-height: ${Number(options.lineHeight) || 1.8};
    text-align: ${options.textAlign || 'left'};
    text-indent: ${Number(options.textIndent) || 0}em;
    white-space: pre-wrap;
    word-break: break-word;
}

.quote-date {
    margin-top: 40px;
    font-size: 22px;
    opacity: 0.7;
}

/* 用户自定义样式 */
${customCss}
</style>
</head>
<body>
<div class="quote-container">
    <div class="quote-title">${escapeHtml(titleText)}</div>
    <div class="quote-subtitle">${escapeHtml(subtitleText)}</div>
    <div class="quote-content">${escapeHtml(text)}</div>
    ${showDate ? `<div class="quote-date">${new Date().toLocaleDateString()}</div>` : ''}
</div>
</body>
</html>
    `.trim();

    // 使用 html2canvas 或截图方式导出
    // 这里先导出为 HTML 文件
    const blob = new Blob([htmlContent], {
        type: 'text/html;charset=utf-8',
    });

    const filename = `${sanitizeTutuFilename(
        `克制放映室-CSS-${characterName}`
    )}.html`;

    downloadTutuBlob(blob, filename);

    toastr.success('自定义 CSS 书摘已导出为 HTML');
}



function exportTutuHtmlFile(content, characterName) {
    const htmlContent = String(content || '').trim();

    if (!htmlContent) {
        toastr.warning('没有可以导出的 HTML 内容');
        return;
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>克制放映室 - ${escapeHtml(characterName)}</title>
<style>
html, body {
    margin: 0;
    padding: 0;
    background: #f5f5f5;
}

body {
    padding: 24px;
    box-sizing: border-box;
}
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;

    const blob = new Blob(
        [fullHtml],
        {
            type: 'text/html;charset=utf-8',
        }
    );

    const filename =
        `${sanitizeTutuFilename(
            `克制放映室-${characterName}`
        )}.html`;

    downloadTutuBlob(blob, filename);

    toastr.success('HTML 文件已导出');
}
function exportCurrentTutuTheater() {
    const content =
        String(tutuCurrentResultContent || '').trim();

    if (!content) {
        toastr.warning('当前没有可以导出的内容');
        return;
    }

    exportTutuContent(
        content,
        tutuCurrentResultCharacter || 'AI'
    );
}


function showTutuResult(content) {
    content = String(content || '');

    // 保存当前结果，供收藏和导出使用
    tutuCurrentResultContent = content;
    tutuCurrentResultType = isProbablyHtml(content)
        ? 'html'
        : 'text';

    tutuCurrentResultCharacter =
        getCurrentTutuCharacterName();

    $('#tutu_result_source').text(content);
    $('#tutu_result_status').text(
        isProbablyHtml(content)
            ? '检测到 HTML 内容，可以切换到预览模式。'
            : '生成完成。'
    );

    const $preview = $('#tutu_result_preview');
    $preview.empty();

    if (!content.trim()) {
        $preview.html(`
            <div class="tutu-result-placeholder">
                没有生成内容。
            </div>
        `);
        return;
    }

    const rendered = buildTutuRenderedContent(content);

    if (rendered.isHtml) {
        const iframe = document.createElement('iframe');

        /*
         * sandbox 可以防止生成的 HTML 直接操作酒馆页面。
         * 如果你确实需要 HTML 内的 JavaScript，
         * 可以改成：iframe.setAttribute('sandbox', 'allow-scripts');
         *
         * 但不建议允许脚本操作父页面。
         */
// 允许生成页面运行 JavaScript。
// 不添加 allow-same-origin，避免生成内容访问酒馆页面的 Cookie、LocalStorage 等。
iframe.setAttribute(
    'sandbox',
    'allow-scripts allow-forms allow-modals'
);

iframe.srcdoc = rendered.html;


        $preview.append(iframe);

        $('#tutu_show_preview_btn').show();
        $('#tutu_show_source_btn').show();

        showTutuResultMode('preview');
    } else {
        const $plain = $('<div class="tutu-plain-preview"></div>');
        fillTutuPlainText($plain[0], content);

        $preview.append($plain);

        $('#tutu_show_preview_btn').show();
        $('#tutu_show_source_btn').show();

        showTutuResultMode('preview');
    }
    updateTutuFavoriteButtonState();
}
// ==========================================
// 嵌入聊天楼层
// ==========================================

const TUTU_THEATER_START = '<!-- TUTU_THEATER_START -->';
const TUTU_THEATER_END = '<!-- TUTU_THEATER_END -->';

/**
 * 从消息文本中移除旧的小剧场内容
 */
function stripTutuTheaterFromMessage(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    const regex = new RegExp(
        TUTU_THEATER_START + '[\\s\\S]*?' + TUTU_THEATER_END,
        'g'
    );

    return text.replace(regex, '').trimEnd();
}

async function embedTutuTheaterToChat(
    content,
    allowReplace = false
) {

    content = String(content || '').trim();

    if (!content) {
        toastr.warning('没有可嵌入的内容');
        return;
    }

    const context = SillyTavern.getContext();
    const chat = Array.isArray(context.chat) ? context.chat : [];

    // 找到最后一条 AI 消息
    let lastAiIndex = -1;

    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i].is_user) {
            lastAiIndex = i;
            break;
        }
    }

    if (lastAiIndex === -1) {
        toastr.warning('找不到 AI 回复消息，无法嵌入');
        return;
    }
const message = chat[lastAiIndex];

/*
 * 自动生成时：
 * 如果这一层已经有小剧场，就不再重复生成。
 *
 * 手动生成时 allowReplace = true，
 * 可以重新生成并替换这一层的小剧场。
 */
if (
    !allowReplace &&
    String(message.mes || '')
        .includes(TUTU_THEATER_START)
) {
    toastr.info(
        '这一层已经生成过小剧场，未重复嵌入'
    );

    return;
}

// 先移除旧的小剧场内容
let originalMes =
    stripTutuTheaterFromMessage(message.mes);


    // 构建小剧场块 —— 注意：不要用 HTML 标签，
    // 因为 SillyTavern 的消息格式化可能会破坏它。
    // 改用纯文本标记 + 在 DOM 层面追加渲染后的 HTML。
    const theaterMarker = `\n\n${TUTU_THEATER_START}\n${TUTU_THEATER_END}`;

    // 在 mes 字段中只保存标记（用于正则过滤）
    // 实际显示内容通过 DOM 操作追加
    message.mes = originalMes + theaterMarker;

    // 保存聊天记录
    try {
        await context.saveChat?.();
    } catch (e) {
        console.warn('保存聊天记录时出错：', e);
    }

    // 在 DOM 层面追加小剧场内容
    try {
        const $messageBlock = $(`.mes[mesid="${lastAiIndex}"]`);

if (!$messageBlock.length) {
    /*
     * 找不到 DOM 时先保存内容。
     * 聊天重新渲染后由 restoreAllTutuTheaterEmbeds()
     * 自动恢复。
     */
    saveTutuTheaterContent(
        lastAiIndex,
        content
    );

    await context.reloadCurrentChat?.();

    setTimeout(() => {
        restoreAllTutuTheaterEmbeds();
    }, 300);

    return;
}

// 保存小剧场内容，以便切换聊天后恢复
saveTutuTheaterContent(lastAiIndex, content);

appendTheaterToDOM(
    lastAiIndex,
    content,
    getCurrentTutuCharacterName(),
    getCurrentTutuCharacterAvatar()
);
    } catch (error) {
        console.error('嵌入小剧场到聊天失败：', error);
        toastr.error('嵌入失败：' + (error.message || error));
    }
}

function appendTheaterToDOM(
    mesId,
    content,
    characterName = '',
    characterAvatar = ''
) {
    const $messageBlock = $(`.mes[mesid="${mesId}"]`);

    if (!$messageBlock.length) {
        console.warn('找不到消息 DOM 元素：', mesId);
        return;
    }

    const $mesText = $messageBlock.find('.mes_text');

    if (!$mesText.length) {
        console.warn('找不到 .mes_text 元素');
        return;
    }

    // 先移除该楼层中已有的小剧场 DOM
    $mesText.find('.tutu-theater-embed').remove();

    content = String(content || '').trim();

    /*
     * true  = 默认折叠
     * false = 默认展开
     */
    const isCollapsed =
        Boolean(tutuSettings.embedDefaultCollapsed);

const details = document.createElement('details');

details.className = 'tutu-theater-embed';
details.open = !isCollapsed;

/*
 * 保存内容到 DOM 节点自身。
 * 这样点击收藏、导出、放大时可以直接取出原始内容，
 * 不需要把 HTML 内容塞进 data-* 属性。
 */
details._tutuTheaterContent = content;
details._tutuTheaterCharacter =
    String(
        characterName ||
        getCurrentTutuCharacterName() ||
        'AI'
    ).trim() || 'AI';
details._tutuTheaterAvatar =
    String(
        characterAvatar ||
        findTutuCharacterAvatarByName(
            details._tutuTheaterCharacter
        ) ||
        getCurrentTutuCharacterAvatar() ||
        ''
    ).trim();
const summary = document.createElement('summary');
summary.className = 'tutu-theater-embed-header';

const titleSpan = document.createElement('span');
titleSpan.className = 'tutu-theater-embed-title';
titleSpan.textContent = '🐱 克制放映室';

const toggleSpan = document.createElement('span');
toggleSpan.className = 'tutu-theater-embed-toggle';
toggleSpan.textContent = '';
toggleSpan.setAttribute('aria-hidden', 'true');

const embedActions = document.createElement('span');
embedActions.className = 'tutu-theater-embed-actions';

function createEmbedActionButton(
    iconClass,
    titleText,
    handler
) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'tutu-theater-embed-action';
    button.title = titleText;

    button.innerHTML =
        `<i class="${iconClass}"></i>`;

    /*
     * 防止点击按钮时触发 details 展开/折叠
     */
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        handler();
    });

    return button;
}

const embedFavoriteButton =
    createEmbedActionButton(
        'fa-regular fa-heart',
        '收藏小剧场',
        () => {
favoriteTutuContent(
    details._tutuTheaterContent,
    details._tutuTheaterCharacter,
    '',
    details._tutuTheaterAvatar
);
        }
    );

const embedExportButton =
    createEmbedActionButton(
        'fa-solid fa-file-export',
        '导出小剧场',
        () => {
            exportTutuContent(
                details._tutuTheaterContent,
                details._tutuTheaterCharacter
            );
        }
    );

const embedFullscreenButton =
    createEmbedActionButton(
        'fa-solid fa-expand',
        '放大查看小剧场',
        () => {
            openTutuTheaterFullscreen(
                details._tutuTheaterContent,
                details._tutuTheaterCharacter
            );
        }
    );

embedActions.appendChild(embedFavoriteButton);
embedActions.appendChild(embedExportButton);
embedActions.appendChild(embedFullscreenButton);

summary.appendChild(titleSpan);
summary.appendChild(toggleSpan);
summary.appendChild(embedActions);


    const body = document.createElement('div');
    body.className = 'tutu-theater-embed-body';

    /*
     * HTML 内容必须放进 iframe.srcdoc。
     *
     * iframe 会建立独立的文档环境，
     * 其中的 style、body、html、CSS 选择器不会影响
     * SillyTavern 外部页面。
     */
    const rendered = buildTutuRenderedContent(content);

    if (rendered.isHtml) {
        const iframe = document.createElement('iframe');

        iframe.className = 'tutu-theater-embed-iframe';
        iframe.title = '克制放映室 HTML 内容';

        /*
         * 不允许 allow-same-origin，
         * 这样 iframe 内的 HTML 无法访问酒馆页面的
         * Cookie、LocalStorage、DOM 等内容。
         *
         * 如果你的 HTML 只需要显示，不需要 JavaScript，
         * 可以直接使用 sandbox=""，安全性更高。
         */
        iframe.setAttribute(
            'sandbox',
            'allow-scripts allow-forms allow-modals'
        );

        iframe.srcdoc = rendered.html;

        body.appendChild(iframe);
    } else {
        /*
         * 纯文本使用 textContent，
         * 不使用 innerHTML，避免文本被当成 HTML 执行。
         */
        // fillTutuPlainText 内部全部转义，不会把文本当 HTML 执行
        fillTutuPlainText(body, content);
    }

    details.appendChild(summary);
    details.appendChild(body);

    // 使用 DOM 节点追加，不使用 HTML 字符串拼接
    $mesText[0].appendChild(details);
}
function installTutuTargetCss(target, css) {
    const styleId = `tutu_custom_style_${target}`;

    let style = document.getElementById(styleId);

    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }

    const rootMap = {
        manager: '#tutu_theater_panel',
        embed: '.tutu-theater-embed.tutu-embed-theme-custom',
        quote: '.quote-container',
    };

    style.textContent = String(css || '')
        .replaceAll('{{root}}', rootMap[target]);
}



// ==========================================
// 小剧场收藏、导出、全屏查看通用函数
// ==========================================

function favoriteTutuContent(
    content,
    characterName,
    title = '',
    characterAvatar = ''
) {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('当前没有可以收藏的小剧场');
        return;
    }

    const finalCharacterName =
        String(characterName || 'AI').trim() || 'AI';

    /*
     * 优先使用调用方传入的头像。
     * 如果没有传入，则按照角色名称从 SillyTavern 中查找。
     *
     * 如果收藏的是当前角色，也会自动拿到当前角色头像。
     */
    const finalCharacterAvatar =
        String(characterAvatar || '').trim() ||
        findTutuCharacterAvatarByName(
            finalCharacterName
        ) ||
        (
            finalCharacterName ===
            getCurrentTutuCharacterName()
                ? getCurrentTutuCharacterAvatar()
                : ''
        );

    const titleInput = window.prompt(
        '请输入这个小剧场的收藏名称：',
        title || `来自${finalCharacterName}的小剧场`
    );

    if (titleInput === null) {
        return;
    }

    const finalTitle =
        String(titleInput || '').trim() ||
        '未命名小剧场';

    const favorites = loadTutuFavorites();

    const record = {
        id:
            typeof crypto?.randomUUID === 'function'
                ? crypto.randomUUID()
                : `favorite-${Date.now()}-${Math.random()
                    .toString(16)
                    .slice(2)}`,

        title: finalTitle,

        content: text,

        type: isProbablyHtml(text)
            ? 'html'
            : 'text',

        characterName: finalCharacterName,

        /*
         * 新增：保存角色卡头像文件名
         */
        characterAvatar: finalCharacterAvatar,

        createdAt: Date.now(),
    };

    favorites.unshift(record);

    saveTutuFavorites(favorites);

    renderTutuFavorites();

    toastr.success(
        `已收藏：「${record.title}」`,
        '克制放映室'
    );
}


function exportTutuContent(
    content,
    characterName = 'AI'
) {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('当前没有可以导出的内容');
        return;
    }

    const finalCharacterName =
        String(characterName || 'AI').trim() || 'AI';

    /*
     * HTML 内容直接导出为 HTML 文件
     */
    if (isProbablyHtml(text)) {
        exportTutuHtmlFile(
            text,
            finalCharacterName
        );

        return;
    }

const exportFormat =
    $('#tutu_export_format').val() || 'text';

if (exportFormat === 'text') {
    exportTutuTextFile(
        text,
        finalCharacterName
    );

    return;
}

// 打开书摘编辑器
openTutuQuoteEditor(text, finalCharacterName);

}
// ==========================================
// 书摘图片编辑器
// ==========================================

let tutuQuoteEditorContent = '';
let tutuQuoteEditorCharacter = 'AI';

function openTutuQuoteEditor(content, characterName) {
    tutuQuoteEditorContent = String(content || '').trim();
    tutuQuoteEditorCharacter = String(characterName || 'AI').trim() || 'AI';

    // 如果编辑器已存在，先移除
    closeTutuQuoteEditor();

    const allStyles = getAllTutuQuoteStyles();

    const styleOptionsHtml = allStyles.map(s =>
        `<option value="${s.value}">${escapeHtml(s.name)}</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'tutu_quote_editor_overlay';
    overlay.innerHTML = `
        <div class="tutu-quote-editor">
            <div class="tutu-quote-editor-header">
                <div class="tutu-quote-editor-title">
                    <i class="fa-solid fa-image"></i>
                    书摘图片设置
                </div>
                <button type="button" id="tutu_quote_editor_close"
                    class="tutu-fullscreen-action-btn tutu-fullscreen-close-btn"
                    title="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div class="tutu-quote-editor-body">
                <div class="tutu-quote-editor-controls">

                    <div class="tutu-quote-control-group">
                        <label class="tutu-quote-control-label">
                            书摘样式
                        </label>
                        <select id="tutu_qe_style" class="text_pole">
                            ${styleOptionsHtml}
                        </select>
                    </div>

                    <div class="tutu-quote-control-row">
                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                正文字号 (px)
                            </label>
                            <input id="tutu_qe_font_size" class="text_pole"
                                type="number" min="16" max="72" value="32">
                        </div>

                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                行高倍数
                            </label>
                            <input id="tutu_qe_line_height" class="text_pole"
                                type="number" min="1" max="4" step="0.1" value="1.8">
                        </div>
                    </div>

                    <div class="tutu-quote-control-row">
                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                段落缩进 (字数)
                            </label>
                            <input id="tutu_qe_text_indent" class="text_pole"
                                type="number" min="0" max="8" value="2">
                        </div>

                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                文字对齐
                            </label>
                            <select id="tutu_qe_text_align" class="text_pole">
                                <option value="left" selected>左对齐</option>
                                <option value="center">居中</option>
                            </select>
                        </div>
                    </div>

                    <div class="tutu-quote-control-row">
                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                水平边距 (px)
                            </label>
                            <input id="tutu_qe_padding_h" class="text_pole"
                                type="number" min="20" max="200" value="90">
                        </div>

                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                垂直边距 (px)
                            </label>
                            <input id="tutu_qe_padding_v" class="text_pole"
                                type="number" min="20" max="200" value="90">
                        </div>
                    </div>

                    <div class="tutu-quote-control-group">
                        <label class="tutu-quote-control-label">
                            图片宽度 (px)
                        </label>
                        <input id="tutu_qe_image_width" class="text_pole"
                            type="number" min="600" max="3000" step="100" value="1200">
                    </div>

                    <div class="tutu-quote-control-row">
                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                标题文字
                            </label>
                            <input id="tutu_qe_title" class="text_pole"
                                type="text" value="克制放映室">
                        </div>

                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                副标题
                            </label>
                            <input id="tutu_qe_subtitle" class="text_pole"
                                type="text" value="来自：${escapeHtml(tutuQuoteEditorCharacter)}">
                        </div>
                    </div>

                    <div class="tutu-quote-control-row tutu-quote-checkboxes">
                        <label class="tutu-quote-checkbox-label">
                            <input type="checkbox" id="tutu_qe_show_date" checked>
                            显示日期
                        </label>

                        <label class="tutu-quote-checkbox-label">
                            <input type="checkbox" id="tutu_qe_show_quote_mark" checked>
                            显示引号装饰
                        </label>

                        <label class="tutu-quote-checkbox-label">
                            <input type="checkbox" id="tutu_qe_show_deco_line" checked>
                            显示装饰线
                        </label>
                    </div>

                    <div class="tutu-quote-control-group tutu-custom-css-group" style="display:none;">
                        <label class="tutu-quote-control-label">
                            自定义 CSS 样式
                        </label>
<input
    id="tutu_quote_style_name"
    class="text_pole"
    placeholder="书摘样式名称">

<select id="tutu_quote_style_preset" class="text_pole">
    <option value="">选择已保存样式</option>
</select>

<div class="tutu-appearance-actions">
    <button id="tutu_save_quote_style" class="menu_button">
        保存样式
    </button>

    <button id="tutu_delete_quote_style" class="menu_button">
        删除样式
    </button>
</div>
                        <textarea id="tutu_qe_custom_css" class="text_pole tutu-custom-css-textarea"
                            rows="8"
                            placeholder=".quote-container { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }&#10;.quote-title { color: white; }&#10;.quote-content { color: #f0f0f0; }"></textarea>
                        <div class="tutu-api-help">
                            你可以覆盖 .quote-container、.quote-title、.quote-subtitle、.quote-content、.quote-date 的样式
                        </div>
                    </div>

                </div>


                <div class="tutu-quote-editor-preview-area">
                    <div class="tutu-quote-preview-title" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>实时预览</span>
                        
                        <!-- ★ 新增的缩放滑动条 -->
                        <div style="display:flex; gap:8px; align-items:center; background:rgba(0,0,0,0.15); padding:4px 12px; border-radius:20px;">
                            <i class="fa-solid fa-magnifying-glass-minus" style="font-size:0.8em; opacity:0.7;"></i>
                            <input type="range" id="tutu_qe_zoom_slider" min="20" max="200" value="100" style="width: 100px; margin:0; cursor:pointer;">
                            <i class="fa-solid fa-magnifying-glass-plus" style="font-size:0.8em; opacity:0.7;"></i>
                            <span id="tutu_qe_zoom_label" style="font-size:0.85em; width:45px; text-align:right;">100%</span>
                        </div>
                    </div>
                    
                    <div class="tutu-quote-preview-scroll">
                        <canvas id="tutu_qe_preview_canvas"></canvas>
                    </div>
                </div>
            </div>

            <div class="tutu-quote-editor-footer">
                <button type="button" id="tutu_qe_refresh_btn"
                    class="menu_button">
                    <i class="fa-solid fa-rotate"></i>
                    刷新预览
                </button>

                <button type="button" id="tutu_qe_export_btn"
                    class="menu_button" style="background:var(--SmartThemeQuoteColor);color:#fff;">
                    <i class="fa-solid fa-download"></i>
                    导出图片
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // 绑定事件
    $('#tutu_quote_editor_close').on('click', closeTutuQuoteEditor);
    // 样式切换时显示/隐藏自定义 CSS
    $(overlay).on('change', '#tutu_qe_style', function() {
        const selectedStyle = $(this).val();
        if (selectedStyle === 'custom_css') {
            $('.tutu-custom-css-group').slideDown(200);
            $('#tutu_qe_preview_canvas').hide();
            $('.tutu-quote-preview-scroll').html(`
                <div style="padding:20px;text-align:center;opacity:0.7;">
                    自定义 CSS 书摘将导出为 HTML 文件<br>
                    请直接点击"导出图片"按钮
                </div>
            `);
        } else {
            $('.tutu-custom-css-group').slideUp(200);
            $('#tutu_qe_preview_canvas').show();
            renderTutuQuotePreview();
        }
    });

    // 实时预览：控件变化时自动刷新
    $(overlay).on(
        'input change',
        '#tutu_qe_style, #tutu_qe_font_size, #tutu_qe_line_height, ' +
        '#tutu_qe_text_indent, #tutu_qe_text_align, #tutu_qe_padding_h, ' +
        '#tutu_qe_padding_v, #tutu_qe_image_width, #tutu_qe_title, ' +
        '#tutu_qe_subtitle, #tutu_qe_show_date, #tutu_qe_show_quote_mark, ' +
        '#tutu_qe_show_deco_line',
        debounceQuotePreview
    );

    $('#tutu_qe_refresh_btn').on('click', renderTutuQuotePreview);
    // ★ 绑定滑动条缩放逻辑
    $(overlay).on('input', '#tutu_qe_zoom_slider', function() {
        const val = $(this).val();
        $('#tutu_qe_zoom_label').text(val + '%');
        $('#tutu_qe_preview_canvas').css({
            'width': val + '%',
            'height': 'auto' // 保持比例
        });
    });

    $('#tutu_qe_export_btn').on('click', async () => {
        const options = getTutuQuoteEditorOptions();
        await exportTutuQuoteImage(
            tutuQuoteEditorContent,
            tutuQuoteEditorCharacter,
            options.styleName,
            options
        );
    });

    // ESC 关闭
    overlay._tutuEscHandler = (e) => {
        if (e.key === 'Escape') closeTutuQuoteEditor();
    };
    document.addEventListener('keydown', overlay._tutuEscHandler);
    // 点击预览图片即可放大/缩小
    $(overlay).on('click', '#tutu_qe_preview_canvas', function() {
        $(this).toggleClass('tutu-zoomed');
    });


    // 首次渲染预览
    setTimeout(renderTutuQuotePreview, 100);
}

function closeTutuQuoteEditor() {
    const overlay = document.getElementById('tutu_quote_editor_overlay');
    if (overlay) {
        if (overlay._tutuEscHandler) {
            document.removeEventListener('keydown', overlay._tutuEscHandler);
        }
        overlay.remove();
    }
}

function getTutuQuoteEditorOptions() {
    return {
        styleName: $('#tutu_qe_style').val() || 'classic',
        fontSize: Number($('#tutu_qe_font_size').val()) || 32,
        lineHeight: Number($('#tutu_qe_line_height').val()) || 1.8,
        textIndent: Number($('#tutu_qe_text_indent').val()) || 0,
        textAlign: $('#tutu_qe_text_align').val() || 'left',
        paddingH: Number($('#tutu_qe_padding_h').val()) || 90,
        paddingV: Number($('#tutu_qe_padding_v').val()) || 90,
        imageWidth: Number($('#tutu_qe_image_width').val()) || 1200,
        titleText: $('#tutu_qe_title').val() || '克制放映室',
        subtitleText: $('#tutu_qe_subtitle').val() || `来自：${tutuQuoteEditorCharacter}`,
        showDate: $('#tutu_qe_show_date').is(':checked'),
        showQuoteMark: $('#tutu_qe_show_quote_mark').is(':checked'),
        showDecoLine: $('#tutu_qe_show_deco_line').is(':checked'),
        customCss: $('#tutu_qe_custom_css').val() || '',

    };
}

let tutuQuotePreviewTimer = null;

function debounceQuotePreview() {
    if (tutuQuotePreviewTimer) {
        clearTimeout(tutuQuotePreviewTimer);
    }
    tutuQuotePreviewTimer = setTimeout(renderTutuQuotePreview, 200);
}

function renderTutuQuotePreview() {
    const canvas = document.getElementById('tutu_qe_preview_canvas');
    if (!canvas) return;
    const options = getTutuQuoteEditorOptions();
    
    // 自定义 CSS 不显示预览
    if (options.styleName === 'custom_css') {
        return;
    }

    const ctx = canvas.getContext('2d');
    const style = getTutuQuoteStyle(options.styleName);
    const text = tutuQuoteEditorContent;

    const fontSize = options.fontSize;
    const lineHeightRatio = options.lineHeight;
    const lineHeight = Math.round(fontSize * lineHeightRatio);
    const paddingH = options.paddingH;
    const paddingV = options.paddingV;
    const width = options.imageWidth;
    const contentWidth = width - paddingH * 2;

    ctx.font = `${fontSize}px ${style.font}`;

    // 换行计算 (直接调用封装好的换行函数)
    const lines = wrapTutuCanvasText(ctx, text, contentWidth, options.textIndent);

    const headerHeight = 160;
    const footerHeight = options.showDate ? 100 : 50;
    const bodyHeight = lines.length * lineHeight;
    const height = Math.max(
        500,
        paddingV + headerHeight + bodyHeight + footerHeight + paddingV
    );

    canvas.width = width;
    canvas.height = height;

    // ★ 按照滑动条的值来设置预览宽度
    const zoomVal = $('#tutu_qe_zoom_slider').val() || 100;
    canvas.style.width = `${zoomVal}%`;
    canvas.style.height = 'auto'; // 保持宽高比


    // 【关键修复】：这里不再写死画背景和文字，而是调用统一的渲染引擎！
    renderQuoteStyle(ctx, {
        style,
        width,
        height,
        contentWidth,
        paddingH,
        paddingV,
        text, // 把原始文本传进去，古风卷轴需要用到
        lines,
        lineHeight,
        fontSize: options.fontSize,
        textAlign: options.textAlign,
        titleText: options.titleText,
        subtitleText: options.subtitleText,
        showDate: options.showDate,
        showQuoteMark: options.showQuoteMark,
        showDecoLine: options.showDecoLine,
        characterName: tutuQuoteEditorCharacter,
    });
}


/**
 * 创建全屏小剧场查看层
 *
 * HTML 内容使用 iframe.srcdoc。
 * 这样 HTML 内的 CSS、JS、按钮、表单都可以在自己的文档中运行，
 * 但不会影响 SillyTavern 主页面。
 */
function openTutuTheaterFullscreen(
    content,
    characterName = 'AI'
) {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('当前没有可以查看的小剧场');
        return;
    }

    closeTutuTheaterFullscreen();

    const finalCharacterName =
        String(characterName || 'AI').trim() || 'AI';

    const overlay = document.createElement('div');
    overlay.id = 'tutu_theater_fullscreen';

    const header = document.createElement('div');
    header.className = 'tutu-fullscreen-header';

    const title = document.createElement('div');
    title.className = 'tutu-fullscreen-title';
    title.textContent =
        `🐱 克制放映室 · ${finalCharacterName}`;

    const actions = document.createElement('div');
    actions.className = 'tutu-fullscreen-actions';

    const favoriteButton = document.createElement('button');
    favoriteButton.type = 'button';
    favoriteButton.className = 'tutu-fullscreen-action-btn';
    favoriteButton.title = '收藏小剧场';
    favoriteButton.innerHTML =
        '<i class="fa-regular fa-heart"></i>';

    favoriteButton.addEventListener('click', event => {
        event.stopPropagation();

        favoriteTutuContent(
            text,
            finalCharacterName
        );
    });

    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'tutu-fullscreen-action-btn';
    exportButton.title = '导出小剧场';
    exportButton.innerHTML =
        '<i class="fa-solid fa-file-export"></i>';

    exportButton.addEventListener('click', event => {
        event.stopPropagation();

        exportTutuContent(
            text,
            finalCharacterName
        );
    });

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className =
        'tutu-fullscreen-action-btn tutu-fullscreen-close-btn';
    closeButton.title = '关闭全屏';
    closeButton.innerHTML =
        '<i class="fa-solid fa-xmark"></i>';

    closeButton.addEventListener('click', event => {
        event.stopPropagation();

        closeTutuTheaterFullscreen();
    });

    actions.appendChild(favoriteButton);
    actions.appendChild(exportButton);
    actions.appendChild(closeButton);

    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'tutu-fullscreen-body';

    const rendered = buildTutuRenderedContent(text);

    if (rendered.isHtml) {
        const iframe = document.createElement('iframe');

        iframe.className = 'tutu-fullscreen-iframe';
        iframe.title = '克制放映室全屏内容';
        iframe._tutuSourceText = text;

        iframe.setAttribute(
            'sandbox',
            'allow-scripts allow-forms allow-modals'
        );

        iframe.srcdoc = rendered.html;

        body.appendChild(iframe);
    } else {
        const plain = document.createElement('div');

        plain.className = 'tutu-fullscreen-plain';
        fillTutuPlainText(plain, text);

        // 修正气泡后按原文重新渲染
        plain._tutuSourceText = text;

        body.appendChild(plain);
    }

    overlay.appendChild(header);
    overlay.appendChild(body);

    document.body.appendChild(overlay);

    document.body.classList.add(
        'tutu-fullscreen-open'
    );

    /*
     * ESC 关闭全屏
     */
    overlay._tutuEscHandler = event => {
        if (event.key === 'Escape') {
            closeTutuTheaterFullscreen();
        }
    };

    document.addEventListener(
        'keydown',
        overlay._tutuEscHandler
    );
}

function closeTutuTheaterFullscreen() {
    const overlay =
        document.getElementById(
            'tutu_theater_fullscreen'
        );

    if (overlay) {
        if (overlay._tutuEscHandler) {
            document.removeEventListener(
                'keydown',
                overlay._tutuEscHandler
            );
        }

        overlay.remove();
    }

    document.body.classList.remove(
        'tutu-fullscreen-open'
    );
}


function showTutuResultMode(mode) {
    if (mode === 'source') {
        $('#tutu_result_preview').hide();
        $('#tutu_result_source').show();

        $('#tutu_show_source_btn').addClass('active');
        $('#tutu_show_preview_btn').removeClass('active');
    } else {
        $('#tutu_result_preview').show();
        $('#tutu_result_source').hide();

        $('#tutu_show_preview_btn').addClass('active');
        $('#tutu_show_source_btn').removeClass('active');
    }
}

// ==========================================
// 对话气泡修正：双击菜单 + 修正面板，改动自动保存
// ==========================================

const TUTU_LINE_MODE_OPTIONS = [
    { value: '', label: '自动', icon: 'fa-wand-magic-sparkles', title: '按自动识别显示' },
    { value: 'speech', label: '对话', icon: 'fa-comment', title: '台词气泡：名字 + 粗竖线，台词放进气泡' },
    { value: 'chat', label: '聊天气泡', icon: 'fa-comments', title: '微信式聊天气泡：头像 + 名字 + 消息' },
    { value: 'emph', label: '普通引用', icon: 'fa-quote-left', title: '引号只是引用 / 强调，不是说话：不出气泡' },
    { value: 'plain', label: '无气泡', icon: 'fa-paragraph', title: '按普通段落显示' },
];

function getTutuLineModeLabel(mode) {
    return TUTU_LINE_MODE_OPTIONS.find(item => item.value === mode)?.label || '自动';
}

/** 读出块当前显示成什么：kind 对应模式值，name 是显示的说话人 */
function describeTutuBlock(element) {
    if (!element) return { kind: 'plain', label: '段落', name: '' };

    if (element.classList.contains('tutu-dialogue')) {
        return {
            kind: 'speech',
            label: '对话',
            name: element.querySelector('.tutu-dialogue-name')?.textContent || '',
        };
    }

    if (element.classList.contains('tutu-chat-row')) {
        return {
            kind: 'chat',
            label: '聊天气泡',
            name: element.querySelector('.tutu-chat-name')?.textContent || '',
        };
    }

    if (element.classList.contains('tutu-chat-tip')) return { kind: 'plain', label: '聊天提示', name: '' };
    if (element.querySelector('.tutu-emph')) return { kind: 'emph', label: '普通引用', name: '' };

    return { kind: 'plain', label: '段落', name: '' };
}

/** 修改某一行的修正并立即保存，所有显示位置重新渲染 */
function setTutuLineOverride(text, lineIndex, patch) {
    const source = normalizeTutuPlainSource(text);
    const lines = { ...getTutuDialogueOverrides(source) };
    const next = sanitizeTutuLineOverride({ ...(lines[lineIndex] || {}), ...patch });

    if (next) lines[lineIndex] = next;
    else delete lines[lineIndex];

    saveTutuDialogueOverrides(source, lines);
    refreshTutuCurrentRender();
    renderTutuDialogueEditor();
}

/** 名字候选：酒馆角色 / 用户 + 这段里出现过的名字 */
function collectTutuNameSuggestions(text) {
    const names = new Set(collectTutuKnownSpeakerNames([]));
    const container = document.createElement('div');

    container.innerHTML = formatTutuPlainHtml(text);
    container.querySelectorAll('.tutu-dialogue-name, .tutu-chat-name').forEach(element => {
        const name = element.textContent.trim();
        if (name) names.add(name);
    });

    Object.values(getTutuDialogueOverrides(text)).forEach(item => item?.name && names.add(item.name));

    return [...names];
}

function fillTutuNameDatalist(text) {
    let list = document.getElementById('tutu_line_name_suggestions');

    if (!list) {
        list = document.createElement('datalist');
        list.id = 'tutu_line_name_suggestions';
        document.body.appendChild(list);
    }

    list.innerHTML = collectTutuNameSuggestions(text)
        .map(name => `<option value="${escapeHtml(name)}"></option>`)
        .join('');
}

// ---------- 双击菜单 ----------

function closeTutuLinePopover() {
    const popover = document.getElementById('tutu_line_popover');

    if (!popover) return;

    // 关之前把没失焦的名字提交掉
    const input = popover.querySelector('.tutu-line-popover-name');
    if (input && input.dataset.dirty === '1') commitTutuPopoverName(popover, input);

    popover.remove();
    document.removeEventListener('pointerdown', handleTutuPopoverOutside, true);
    document.removeEventListener('keydown', handleTutuPopoverKey, true);
}

function handleTutuPopoverOutside(event) {
    const popover = document.getElementById('tutu_line_popover');
    if (popover && !popover.contains(event.target)) closeTutuLinePopover();
}

function handleTutuPopoverKey(event) {
    if (event.key === 'Escape') {
        event.stopPropagation();
        closeTutuLinePopover();
    }
}

function commitTutuPopoverName(popover, input) {
    input.dataset.dirty = '0';

    const value = String(input.value || '').trim();
    const auto = popover._tutuAutoName || '';

    setTutuLineOverride(popover._tutuText, popover._tutuLine, {
        // 和自动识别的一样就不存，保持「自动」
        name: value && value !== auto ? value : '',
    });
}

/**
 * 弹出某一行的修正菜单
 * info：{ text, line, x, y, kind, name, focusName }
 */
function openTutuLinePopover(info) {
    closeTutuLinePopover();

    const text = normalizeTutuPlainSource(info.text);
    const lines = text.split('\n');
    const lineText = lines[info.line];

    if (lineText === undefined) return;

    const override = getTutuDialogueOverrides(text)[info.line] || {};
    const mode = override.mode || '';
    const showName = !['emph', 'plain'].includes(mode) && !['emph', 'plain'].includes(info.kind);
    const autoName = override.name ? '' : String(info.name || '');

    fillTutuNameDatalist(text);

    const popover = document.createElement('div');
    popover.id = 'tutu_line_popover';
    popover.className = 'tutu-line-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', `修正第 ${info.line + 1} 行`);
    popover._tutuText = text;
    popover._tutuLine = info.line;
    popover._tutuAutoName = autoName || override.name || '';

    const modeButtons = TUTU_LINE_MODE_OPTIONS.map(option => `
        <button type="button"
            class="tutu-line-popover-mode${option.value === mode ? ' active' : ''}"
            data-mode="${option.value}"
            aria-pressed="${option.value === mode ? 'true' : 'false'}"
            title="${option.title}">
            <i class="fa-solid ${option.icon}" aria-hidden="true"></i>
            <span>${option.label}</span>
        </button>`).join('');

    popover.innerHTML = `
        <div class="tutu-line-popover-head">
            <span>第 ${info.line + 1} 行 · 现在：${escapeHtml(mode ? getTutuLineModeLabel(mode) : `自动（${describeTutuKindLabel(info.kind)}）`)}</span>
            <button type="button" class="tutu-line-popover-close" aria-label="关闭" title="关闭（Esc）">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="tutu-line-popover-source">${escapeHtml(lineText.trim())}</div>
        <div class="tutu-line-popover-modes" role="group" aria-label="显示成">${modeButtons}</div>
        ${showName ? `
        <label class="tutu-line-popover-name-row">
            <span>说话人</span>
            <input type="text"
                class="text_pole tutu-line-popover-name"
                list="tutu_line_name_suggestions"
                maxlength="12"
                value="${escapeHtml(override.name || autoName)}"
                placeholder="留空用自动识别">
        </label>` : ''}
        <div class="tutu-line-popover-foot">
            <span>改动自动保存</span>
            <button type="button" class="tutu-line-popover-more">
                <i class="fa-solid fa-list-check"></i>
                逐行修正
            </button>
        </div>`;

    document.body.appendChild(popover);

    // 定位到双击处，超出屏幕时往回收
    const rect = popover.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, info.x - 20), window.innerWidth - rect.width - margin);
    let top = info.y + 14;

    if (top + rect.height > window.innerHeight - margin) top = info.y - rect.height - 14;

    popover.style.left = `${Math.max(margin, left)}px`;
    popover.style.top = `${Math.max(margin, top)}px`;

    popover.querySelectorAll('.tutu-line-popover-mode').forEach(button => {
        button.addEventListener('click', () => {
            const input = popover.querySelector('.tutu-line-popover-name');
            const patch = { mode: button.dataset.mode || '' };

            if (input && input.dataset.dirty === '1') {
                const value = input.value.trim();
                patch.name = value && value !== popover._tutuAutoName ? value : '';
                input.dataset.dirty = '0';
            }

            setTutuLineOverride(text, info.line, patch);
            closeTutuLinePopover();
            toastr.success(`已改成「${getTutuLineModeLabel(patch.mode)}」`, '', { timeOut: 1500 });
        });
    });

    const input = popover.querySelector('.tutu-line-popover-name');

    if (input) {
        input.addEventListener('input', () => { input.dataset.dirty = '1'; });
        input.addEventListener('change', () => commitTutuPopoverName(popover, input));
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commitTutuPopoverName(popover, input);
                closeTutuLinePopover();
                toastr.success('名字已保存', '', { timeOut: 1500 });
            }
        });

        if (info.focusName) {
            input.focus();
            input.select();
        }
    }

    popover.querySelector('.tutu-line-popover-close').addEventListener('click', closeTutuLinePopover);
    popover.querySelector('.tutu-line-popover-more').addEventListener('click', () => {
        closeTutuLinePopover();
        openTutuDialogueEditor(text, info.line);
    });

    if (!info.focusName) popover.querySelector('.tutu-line-popover-mode.active, .tutu-line-popover-mode')?.focus();

    // 等这次双击结束再监听外部点击
    setTimeout(() => {
        document.addEventListener('pointerdown', handleTutuPopoverOutside, true);
        document.addEventListener('keydown', handleTutuPopoverKey, true);
    }, 0);
}

function describeTutuKindLabel(kind) {
    return { speech: '对话', chat: '聊天气泡', emph: '普通引用' }[kind] || '段落';
}

// ---------- 双击名字直接改 ----------

function startTutuInlineNameEdit(nameElement, text, lineIndex) {
    if (nameElement.isContentEditable) return;

    const original = nameElement.textContent;
    const override = getTutuDialogueOverrides(text)[lineIndex] || {};
    const autoName = override.name ? '' : original;
    let finished = false;

    nameElement.setAttribute('contenteditable', 'plaintext-only');
    if (nameElement.contentEditable !== 'plaintext-only') nameElement.setAttribute('contenteditable', 'true');
    nameElement.classList.add('tutu-name-editing');
    nameElement.setAttribute('aria-label', '输入说话人名字，回车保存，Esc 取消');
    nameElement.focus();

    const range = document.createRange();
    range.selectNodeContents(nameElement);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const finish = save => {
        if (finished) return;
        finished = true;

        nameElement.removeEventListener('keydown', onKey);
        nameElement.removeEventListener('blur', onBlur);
        nameElement.removeAttribute('contenteditable');
        nameElement.classList.remove('tutu-name-editing');

        const value = nameElement.textContent.replace(/[\r\n]/g, '').trim();

        if (!save || value === original) {
            nameElement.textContent = original;
            return;
        }

        // 清空 = 恢复自动识别；和自动识别一样也不存
        setTutuLineOverride(text, lineIndex, { name: value && value !== autoName ? value : '' });
        toastr.success(value ? `说话人改成「${value}」` : '已恢复自动识别的名字', '', { timeOut: 1500 });
    };

    const onKey = event => {
        event.stopPropagation();

        if (event.key === 'Enter') {
            event.preventDefault();
            finish(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            finish(false);
        } else if (
            event.key.length === 1 &&
            !event.ctrlKey && !event.metaKey &&
            Array.from(nameElement.textContent).length >= 12 &&
            selection.isCollapsed
        ) {
            event.preventDefault();
        }
    };

    const onBlur = () => finish(true);

    nameElement.addEventListener('keydown', onKey);
    nameElement.addEventListener('blur', onBlur);
}

// 页面上的结构化排版（面板预览、楼层、收藏、全屏）：双击块弹菜单，双击名字直接改
$(document).on('dblclick', '.tutu-typo-formatted [data-tutu-line][data-tutu-src]', function (event) {
    if ($(event.target).closest('.tutu-dialogue-editor, .tutu-line-popover, [contenteditable]').length) return;

    const block = event.currentTarget;

    // 嵌套时只处理最内层
    if (event.target.closest('[data-tutu-line][data-tutu-src]') !== block) return;

    const text = tutuRenderedSources.get(block.getAttribute('data-tutu-src'));
    const lineIndex = Number(block.getAttribute('data-tutu-line'));

    if (!text || !Number.isInteger(lineIndex)) return;

    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();

    const nameElement = event.target.closest('.tutu-dialogue-name, .tutu-chat-name');

    if (nameElement && block.contains(nameElement)) {
        closeTutuLinePopover();
        startTutuInlineNameEdit(nameElement, text, lineIndex);
        return;
    }

    const info = describeTutuBlock(block);

    openTutuLinePopover({
        text,
        line: lineIndex,
        x: event.clientX,
        y: event.clientY,
        kind: info.kind,
        name: info.name,
        focusName: Boolean(event.target.closest('.tutu-chat-avatar')),
    });
});

// iframe 里的结构化排版（启用渲染 CSS 时）：里面报上来的双击
function initTutuLineDblclickListener() {
    if (window.__tutuLineDblclickListener) return;
    window.__tutuLineDblclickListener = true;

    window.addEventListener('message', event => {
        const data = event.data;

        if (!data || data.type !== 'tutu-theater-line-dblclick') return;

        const iframe = Array.from(document.querySelectorAll('iframe')).find(
            frame => frame.contentWindow === event.source
        );

        if (!iframe) return;

        const text = tutuRenderedSources.get(String(data.src || ''));
        const lineIndex = Number(data.line);

        if (!text || !Number.isInteger(lineIndex) || lineIndex < 0) return;

        const rect = iframe.getBoundingClientRect();

        openTutuLinePopover({
            text,
            line: lineIndex,
            x: rect.left + Number(data.x || 0),
            y: rect.top + Number(data.y || 0),
            kind: ['speech', 'chat', 'emph', 'plain'].includes(data.kind) ? data.kind : 'plain',
            name: String(data.name || '').slice(0, 12),
            // iframe 里没法直接改字，双击名字时把焦点放进名字输入框
            focusName: Boolean(data.onName),
        });
    });
}

initTutuLineDblclickListener();

// ---------- 逐行修正面板 ----------

/** 面板当前在修正的原文 */
let tutuDialogueEditorText = '';

/** 面板里列出的行：含引号、「名字：」或已经修正过的行 */
function collectTutuEditableLines(text) {
    const source = normalizeTutuPlainSource(text);
    const overrides = getTutuDialogueOverrides(source);
    const quoteTest = /[“”「」『』"‘’]/;

    return source.split('\n')
        .map((line, index) => ({ line, index }))
        .filter(({ line, index }) => line.trim() && (
            overrides[index] ||
            quoteTest.test(line) ||
            parseTutuDialogueLine(line)
        ));
}

function renderTutuDialogueEditor() {
    const modal = document.getElementById('tutu_dialogue_editor');
    const text = tutuDialogueEditorText;

    if (!modal || !text) return;

    const list = modal.querySelector('.tutu-dialogue-editor-list');
    const hint = modal.querySelector('.tutu-dialogue-editor-hint');
    const typo = getTutuTypographyState();
    const overrides = getTutuDialogueOverrides(text);
    const items = collectTutuEditableLines(text);

    const container = document.createElement('div');
    container.innerHTML = formatTutuPlainHtml(text, typo);

    const blocks = new Map();
    container.querySelectorAll('[data-tutu-line]').forEach(element => {
        blocks.set(Number(element.getAttribute('data-tutu-line')), element);
    });

    fillTutuNameDatalist(text);

    const hints = [];
    if (!typo.enabled) hints.push('排版美化未启用，开启后修正才会显示。');
    hints.push('改动自动保存；在正文里双击某一段也能改，双击名字可以直接改名。');
    hint.textContent = hints.join(' ');

    // 保持滚动位置和焦点所在行
    const scrollTop = list.scrollTop;
    const focusedLine = document.activeElement?.closest?.('.tutu-dialogue-editor-item')?.dataset.line;

    if (!items.length) {
        list.innerHTML = '<div class="tutu-dialogue-editor-empty">这段内容里没有台词或引号，不需要修正。</div>';
        return;
    }

    list.innerHTML = items.map(({ line, index }) => {
        const override = overrides[index] || {};
        const mode = override.mode || '';
        const element = blocks.get(index);
        const info = describeTutuBlock(element);
        const showName = !['emph', 'plain'].includes(mode) && !['emph', 'plain'].includes(info.kind);

        const modeButtons = TUTU_LINE_MODE_OPTIONS.map(option => `
            <button type="button"
                class="tutu-line-mode-btn${option.value === mode ? ' active' : ''}"
                data-mode="${option.value}"
                aria-pressed="${option.value === mode ? 'true' : 'false'}"
                title="${option.title}">${option.label}</button>`).join('');

        // 聊天行要套一层 .tutu-chat 才有聊天背景和左右排布
        const blockHtml = element?.classList.contains('tutu-chat-row') || element?.classList.contains('tutu-chat-tip')
            ? `<div class="tutu-chat">${element.outerHTML}</div>`
            : element?.outerHTML || '';

        return `
            <div class="tutu-dialogue-editor-item${mode || override.name ? ' changed' : ''}" data-line="${index}">
                <div class="tutu-dialogue-editor-meta">
                    <span>第 ${index + 1} 行</span>
                    <span class="tutu-dialogue-editor-kind">${escapeHtml(mode ? getTutuLineModeLabel(mode) : `自动 · ${info.label}`)}</span>
                </div>
                <div class="tutu-dialogue-editor-source">${escapeHtml(line.trim())}</div>
                <div class="tutu-dialogue-editor-controls">
                    <div class="tutu-line-mode-group" role="group" aria-label="第 ${index + 1} 行显示成">${modeButtons}</div>
                    ${showName ? `
                    <input type="text"
                        class="text_pole tutu-line-name-input"
                        list="tutu_line_name_suggestions"
                        maxlength="12"
                        value="${escapeHtml(override.name || '')}"
                        data-auto="${escapeHtml(override.name ? '' : info.name)}"
                        placeholder="${info.name && !override.name ? `自动：${escapeHtml(info.name)}` : '说话人名字'}"
                        aria-label="第 ${index + 1} 行说话人">` : ''}
                </div>
                ${blockHtml ? `<div class="tutu-dialogue-editor-preview tutu-typo-plain tutu-typo-formatted">${blockHtml}</div>` : ''}
            </div>`;
    }).join('');

    list.scrollTop = scrollTop;

    if (focusedLine !== undefined) {
        list.querySelector(`.tutu-dialogue-editor-item[data-line="${focusedLine}"] .tutu-line-mode-btn.active`)?.focus();
    }
}

function openTutuDialogueEditor(content = tutuCurrentResultContent, focusLine = null) {
    const text = normalizeTutuPlainSource(content);

    if (!text) {
        toastr.warning('还没有可以修正的内容');
        return;
    }

    if (isProbablyHtml(text)) {
        toastr.info('HTML 小剧场不使用气泡排版，不需要修正');
        return;
    }

    closeTutuLinePopover();
    closeTutuDialogueEditor();

    tutuDialogueEditorText = text;

    const modal = document.createElement('div');
    modal.id = 'tutu_dialogue_editor';
    modal.className = 'tutu-dialogue-editor-overlay';
    modal.innerHTML = `
        <div class="tutu-dialogue-editor" role="dialog" aria-modal="true" aria-label="修正气泡">
            <div class="tutu-dialogue-editor-head">
                <div class="tutu-dialogue-editor-title">
                    <i class="fa-solid fa-pen-to-square"></i>
                    修正气泡
                </div>
                <div class="tutu-dialogue-editor-actions">
                    <button type="button" class="menu_button margin0 tutu-dialogue-editor-reset" title="清除这段内容的所有修正，恢复自动识别">
                        <i class="fa-solid fa-rotate-left"></i>
                        <span>全部自动</span>
                    </button>
                    <button type="button" class="menu_button margin0 tutu-dialogue-editor-done" title="关闭（改动已自动保存）">
                        <i class="fa-solid fa-check"></i>
                        <span>完成</span>
                    </button>
                </div>
            </div>
            <div class="tutu-dialogue-editor-hint"></div>
            <div class="tutu-dialogue-editor-list"></div>
        </div>`;

    document.body.appendChild(modal);
    $('#tutu_edit_dialogue_btn').addClass('active');

    renderTutuDialogueEditor();

    if (focusLine !== null) {
        const item = modal.querySelector(`.tutu-dialogue-editor-item[data-line="${focusLine}"]`);

        if (item) {
            item.scrollIntoView({ block: 'center' });
            item.classList.add('flash');
            setTimeout(() => item.classList.remove('flash'), 1200);
        }
    }

    modal.querySelector('.tutu-dialogue-editor-done').focus();

    modal._tutuEscHandler = event => {
        if (event.key === 'Escape' && !document.getElementById('tutu_line_popover')) {
            event.stopPropagation();
            closeTutuDialogueEditor();
        }
    };

    document.addEventListener('keydown', modal._tutuEscHandler, true);
}

function closeTutuDialogueEditor() {
    const modal = document.getElementById('tutu_dialogue_editor');

    tutuDialogueEditorText = '';
    $('#tutu_edit_dialogue_btn').removeClass('active');

    if (!modal) return;

    // 正在输入的名字先提交
    const input = modal.querySelector('.tutu-line-name-input[data-dirty="1"]');
    if (input) commitTutuEditorName(input, false);

    if (modal._tutuEscHandler) document.removeEventListener('keydown', modal._tutuEscHandler, true);
    modal.remove();
}

function commitTutuEditorName(input, rerender = true) {
    const text = tutuDialogueEditorText;
    const lineIndex = Number(input.closest('.tutu-dialogue-editor-item')?.dataset.line);

    if (!text || !Number.isInteger(lineIndex)) return;

    input.dataset.dirty = '0';

    const value = String(input.value || '').trim();
    const auto = input.dataset.auto || '';
    const source = normalizeTutuPlainSource(text);
    const lines = { ...getTutuDialogueOverrides(source) };
    const next = sanitizeTutuLineOverride({ ...(lines[lineIndex] || {}), name: value && value !== auto ? value : '' });

    if (next) lines[lineIndex] = next;
    else delete lines[lineIndex];

    saveTutuDialogueOverrides(source, lines);
    refreshTutuCurrentRender();

    if (rerender) renderTutuDialogueEditor();
}

$(document).on('click keydown', '#tutu_edit_dialogue_btn', function (event) {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();

    if (document.getElementById('tutu_dialogue_editor')) closeTutuDialogueEditor();
    else openTutuDialogueEditor();
});

// 收藏卡片上的「修正气泡」
$(document).on('click', '.tutu-favorite-bubble-btn', function (event) {
    event.stopPropagation();

    const id = String($(this).closest('.tutu-favorite-card').data('id'));
    const favorite = loadTutuFavorites().find(item => String(item.id) === id);

    if (!favorite) {
        toastr.error('找不到这条收藏');
        return;
    }

    openTutuDialogueEditor(favorite.content);
});

$(document).on('click', '#tutu_dialogue_editor', function (event) {
    // 点遮罩关闭
    if (event.target === this) closeTutuDialogueEditor();
});

$(document).on('click', '#tutu_dialogue_editor .tutu-line-mode-btn', function () {
    const lineIndex = Number($(this).closest('.tutu-dialogue-editor-item').attr('data-line'));
    const input = $(this).closest('.tutu-dialogue-editor-item').find('.tutu-line-name-input')[0];
    const patch = { mode: String($(this).attr('data-mode') || '') };

    // 名字改了还没失焦就点了样式：一起保存
    if (input && input.dataset.dirty === '1') {
        const value = input.value.trim();
        patch.name = value && value !== (input.dataset.auto || '') ? value : '';
    }

    setTutuLineOverride(tutuDialogueEditorText, lineIndex, patch);
});

// 改名字：打字时只标记，失焦 / 回车时保存，避免打字时输入框被重建
$(document).on('input', '#tutu_dialogue_editor .tutu-line-name-input', function () {
    this.dataset.dirty = '1';
    $(this).closest('.tutu-dialogue-editor-item').addClass('changed');
});

$(document).on('change', '#tutu_dialogue_editor .tutu-line-name-input', function () {
    commitTutuEditorName(this);
});

$(document).on('keydown', '#tutu_dialogue_editor .tutu-line-name-input', function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        commitTutuEditorName(this);
    }
});

$(document).on('click', '#tutu_dialogue_editor .tutu-dialogue-editor-reset', function () {
    const text = tutuDialogueEditorText;
    if (!text) return;

    if (!Object.keys(getTutuDialogueOverrides(text)).length) {
        toastr.info('这段内容还没有修正');
        return;
    }

    saveTutuDialogueOverrides(text, {});
    refreshTutuCurrentRender();
    renderTutuDialogueEditor();
    toastr.success('已恢复自动识别');
});

$(document).on('click', '#tutu_dialogue_editor .tutu-dialogue-editor-done', function () {
    closeTutuDialogueEditor();
});

let tutuCurrentCharacterContext = {
    character: null,
    characterName: 'AI',

    // 当前角色描述
    description: '',

    // 当前用户人设
    userPersona: '',

    worldBookName: '',
    worldEntries: [],
    storageKey: '',
    selectedWorldEntries: [],
    includeHistory: Boolean(tutuSettings.historyIncludeEnabled),
    historyLimit: Number(tutuSettings.historyLimitDefault) || 20,
};




function getCurrentTutuCharacter() {
    const context = SillyTavern.getContext();

    const character =
        context.characterId !== undefined &&
        context.characters?.[context.characterId]
            ? context.characters[context.characterId]
            : null;

    return {
        context,
        character
    };
}
function getCurrentUserPersona(context) {
    if (!context) {
        return '';
    }

    /*
     * 不同版本的 SillyTavern 可能把用户人设放在不同位置，
     * 这里按照常见字段依次兼容读取。
     */

    const persona =
        context.userPersona ||
        context.userPersonaDescription ||
        context.personaDescription ||
        context.powerUserSettings?.persona_description ||
        context.power_user_settings?.persona_description ||
        '';

    return String(persona || '').trim();
}

function getCharacterDescription(character) {
    if (!character) {
        return '';
    }

    return String(
        character.description ||
        character.data?.description ||
        ''
    ).trim();
}

function getCharacterWorldBookName(character) {
    if (!character) {
        return '';
    }

    /*
     * 不同版本的 SillyTavern 可能使用不同位置保存角色世界书名称，
     * 所以这里做多个兼容读取。
     */
    const worldBookName =
        character.data?.extensions?.world ||
        character.data?.extensions?.world_info ||
        character.data?.extensions?.worldbook ||
        character.extensions?.world ||
        character.extensions?.world_info ||
        character.extensions?.worldbook ||
        '';

    return String(worldBookName || '').trim();
}

function getWorldEntryName(entry, index) {
    let name =
        entry.comment ||
        entry.name ||
        (
            Array.isArray(entry.key)
                ? entry.key.join(', ')
                : entry.key
        ) ||
        `世界书条目 ${index + 1}`;

    if (entry.enabled === false) {
        name = `🚫 [禁用] ${name}`;
    }

    return String(name);
}

function renderTutuCharacterBasicInfo() {
    const character = tutuCurrentCharacterContext.character;

    if (!character) {
        $('#tutu_current_character_name').text('当前角色：未找到角色');
        $('#tutu_character_description_preview').text('没有找到当前角色描述');
        return;
    }

    $('#tutu_current_character_name').text(
        `当前角色：${tutuCurrentCharacterContext.characterName}`
    );

    $('#tutu_character_description_preview').text(
        tutuCurrentCharacterContext.description || '当前角色没有填写角色描述'
    );
}

function renderTutuWorldBookEntries() {
    const $list = $('#tutu_character_worldbook_entries');
    $list.empty();

    const worldBookName = tutuCurrentCharacterContext.worldBookName;
    const entries = tutuCurrentCharacterContext.worldEntries;
    const selectedEntries =
        tutuCurrentCharacterContext.selectedWorldEntries || [];

    if (!worldBookName) {
        $('#tutu_character_worldbook_name').text(
            '当前角色没有绑定角色世界书'
        );

        $list.html(`
            <div style="opacity:0.7;">
                没有可选择的世界书条目
            </div>
        `);

        return;
    }

    $('#tutu_character_worldbook_name').text(
        `世界书：${worldBookName}`
    );

    if (!entries.length) {
        $list.html(`
            <div style="opacity:0.7;">
                世界书中没有找到可用条目
            </div>
        `);

        return;
    }

    entries.forEach((entry, index) => {
        const entryKey = String(entry.key ?? index);

        const name = escapeHtml(entry.name);
        const content = escapeHtml(entry.content);

        const isChecked = selectedEntries.includes(entryKey);

        const $item = $(`
            <label class="tutu-world-entry-item">
                <input
                    type="checkbox"
                    class="tutu-character-world-entry-checkbox"
                    data-index="${index}"
                    data-entry-key="${escapeHtml(entryKey)}"
                    ${isChecked ? 'checked' : ''}>

                <div>
                    <div class="tutu-world-entry-name">
                        ${name}
                    </div>

                    <div class="tutu-world-entry-preview">
                        ${content}
                    </div>
                </div>
            </label>
        `);

        $list.append($item);
    });
}
function loadTutuCharacterOptionsToUI() {
    $('#tutu_include_history').prop(
        'checked',
        Boolean(tutuCurrentCharacterContext.includeHistory)
    );

    $('#tutu_history_limit').val(
        tutuCurrentCharacterContext.historyLimit || 20
    );

    $('#tutu_history_include_tags').val(
        tutuSettings.historyIncludeTags || ''
    );

    $('#tutu_history_exclude_tags').val(
        tutuSettings.historyExcludeTags || ''
    );

    $('#tutu_history_exclude_comments').prop(
        'checked',
        tutuSettings.historyExcludeComments !== false
    );

    if (tutuCurrentCharacterContext.includeHistory) {
        $('#tutu_history_limit_box').show();
    } else {
        $('#tutu_history_limit_box').hide();
    }
}


async function refreshTutuCharacterContext() {
    const { character } = getCurrentTutuCharacter();

    const context = SillyTavern.getContext();

    const characterName =
        character?.name ||
        character?.data?.name ||
        'AI';

    const description = getCharacterDescription(character);

    // 自动读取当前用户人设，不显示在界面上
    const userPersona = getCurrentUserPersona(context);

    const worldBookName = getCharacterWorldBookName(character);
const characterStorage = getCurrentTutuCharacterStorage();

tutuCurrentCharacterContext = {
    character,
    characterName,

    // 当前角色描述，后台读取，不显示
    description,

    // 当前用户人设，后台读取，不显示
    userPersona,

    worldBookName,
    worldEntries: [],
    storageKey: characterStorage.key,
    selectedWorldEntries:
        characterStorage.settings.selectedWorldEntries || [],
    includeHistory:
        Boolean(characterStorage.settings.includeHistory),
    historyLimit:
        Number(characterStorage.settings.historyLimit) || 20,
};



    renderTutuCharacterBasicInfo();

    if (!worldBookName) {
        renderTutuWorldBookEntries();
        loadTutuCharacterOptionsToUI();
        return;
    }

    $('#tutu_character_worldbook_name').text(
        `世界书：${worldBookName}`
    );

    $('#tutu_character_worldbook_entries').html(`
        <div style="opacity:0.7;">
            <i class="fa-solid fa-spinner fa-spin"></i>
            正在读取世界书条目...
        </div>
    `);

    try {
        const data = await loadWorldInfo(worldBookName);

        if (!data) {
            throw new Error('世界书数据为空');
        }

        const rawEntries = Array.isArray(data.entries)
            ? data.entries
            : Object.values(data.entries || {});

        tutuCurrentCharacterContext.worldEntries = rawEntries
            .map((entry, index) => {
                if (!entry) {
                    return null;
                }

                const content = String(entry.content || '').trim();

                if (!content) {
                    return null;
                }

return {
    key: String(entry.uid ?? entry.id ?? index),
    name: getWorldEntryName(entry, index),
    content
};

            })
            .filter(Boolean);

        renderTutuWorldBookEntries();

    } catch (error) {
        console.error('读取角色世界书失败：', error);

        $('#tutu_character_worldbook_entries').html(`
            <div style="color:red;">
                读取世界书失败：${escapeHtml(error.message || error)}
            </div>
        `);
    }
}
function getSelectedTutuWorldEntries() {
    const selectedEntries = [];

    $('.tutu-character-world-entry-checkbox:checked').each(function () {
        const index = Number($(this).data('index'));
        const entry = tutuCurrentCharacterContext.worldEntries[index];

        if (entry) {
            selectedEntries.push(entry);
        }
    });

    return selectedEntries;
}


function getTutuHistoryText() {
    if (!tutuCurrentCharacterContext.includeHistory) {
        return '';
    }

    const context = SillyTavern.getContext();

    const chat = Array.isArray(context.chat)
        ? context.chat
        : [];

    let limit =
        Number(tutuCurrentCharacterContext.historyLimit) || 20;

    limit = Math.min(Math.max(limit, 1), 100);

    const messages = chat.slice(-limit);

    if (!messages.length) {
        return '当前没有可读取的历史聊天记录。';
    }

    const includeTags = parseTutuTagList(tutuSettings.historyIncludeTags);
    const excludeTags = parseTutuTagList(tutuSettings.historyExcludeTags);

    const lines = messages
        .map(message => {
            const name =
                message.name ||
                (message.is_user ? '用户' : '角色');

            const rawContent =
                stripTutuTheaterFromMessage(
                    String(message.mes || message.content || '')
                );

            const content = filterTutuHistoryContent(
                tutuSettings.historyExcludeComments !== false
                    ? stripTutuHtmlComments(rawContent)
                    : rawContent,
                includeTags,
                excludeTags,
                Boolean(message.is_user)
            );

            return content ? { name, content } : null;
        })
        .filter(Boolean);

    if (!lines.length) {
        return '按当前标签规则，没有可读取的历史聊天内容。';
    }

    return lines
        .map((item, index) =>
            `[${index + 1}] ${item.name}：\n${item.content}`
        )
        .join('\n\n');
}

/**
 * 解析标签列表：支持逗号、中文逗号、空格、换行分隔，
 * 也兼容用户输入 <tag> 这种带尖括号的写法。
 */
function parseTutuTagList(value) {
    return String(value || '')
        .split(/[,，、\s]+/)
        .map(tag => tag.replace(/[<>/]/g, '').trim())
        .filter(tag => /^[\w\u4e00-\u9fa5:.-]+$/.test(tag));
}

/**
 * 删除 HTML 注释：
 * - 完整的 <!-- ... -->（含多行）
 * - 末尾未闭合的 <!-- ...（流式输出被截断时常见）
 * - 残留的 --> 结束符
 */
function stripTutuHtmlComments(text) {
    return String(text || '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<!--[\s\S]*$/, '')
        .replace(/-->/g, '');
}

function escapeTutuTagName(tag) {
    return tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 历史聊天内容按标签过滤：
 * 1. 排除标签：删除 <tag>...</tag> 整块（以及自闭合 <tag/>）
 * 2. 只读标签：只保留这些标签内的内容；
 *    AI 消息里没有任何只读标签时整条跳过，
 *    用户消息没有标签时保留原文（用户输入通常不带标签）。
 */
function filterTutuHistoryContent(
    text,
    includeTags,
    excludeTags,
    isUser
) {
    let result = String(text || '');

    excludeTags.forEach(tag => {
        const name = escapeTutuTagName(tag);

        result = result
            .replace(
                new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${name}>`, 'gi'),
                ''
            )
            .replace(
                new RegExp(`<${name}(?:\\s[^>]*)?\\/>`, 'gi'),
                ''
            );
    });

    if (includeTags.length) {
        const parts = [];

        includeTags.forEach(tag => {
            const name = escapeTutuTagName(tag);
            const regex = new RegExp(
                `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,
                'gi'
            );

            let match;

            while ((match = regex.exec(result)) !== null) {
                const value = match[1].trim();

                if (value) {
                    parts.push({ index: match.index, value });
                }
            }
        });

        if (parts.length) {
            // 按原文出现顺序拼接
            result = parts
                .sort((a, b) => a.index - b.index)
                .map(part => part.value)
                .join('\n');
        } else if (!isUser) {
            return '';
        }
    }

    return result.replace(/\n{3,}/g, '\n\n').trim();
}

function saveTutuWorldEntrySelection() {
    const selectedKeys = [];

    $('.tutu-character-world-entry-checkbox:checked').each(function () {
        selectedKeys.push(String($(this).data('entry-key')));
    });

    tutuCurrentCharacterContext.selectedWorldEntries = selectedKeys;

    saveCurrentTutuCharacterStorage({
        selectedWorldEntries: selectedKeys,
        includeHistory: $('#tutu_include_history').is(':checked'),
        historyLimit: Number($('#tutu_history_limit').val()) || 20,
    });
}
/** 把某类启用的多条提示词拼成一段；多条时每条带名称小标题 */
function joinTutuActiveAuxPromptText(type) {
    const list = getActiveTutuAuxPrompts(type);

    if (list.length <= 1) return list[0]?.content || '';

    return list
        .map(item => `〔${item.name}〕\n${item.content}`)
        .join('\n\n');
}

// ==========================================
// 生成格式：纯文本 / HTML
// ==========================================

/** 内置 HTML 生成要求（设置里可改，留空恢复这一版） */
const TUTU_DEFAULT_HTML_PROMPT = `【输出格式：高级交互 HTML 小剧场】
你同时是顶尖的叙事设计师、视觉设计师和前端工程师。把这段小剧场做成一件「可以玩的短篇作品」：像精品独立游戏的过场、获奖互动网页或高端杂志专题，而不是普通网页模板。剧情是核心，视觉和交互都要为情绪和叙事服务。

一、动手前先在心里定好（不要输出）
1. 一句话的视觉概念：例如「雨夜便利店的冷白荧光」「旧胶片里的夏天」「被翻烂的手账」「深夜的监控屏幕」。整个页面只服务这一个概念。
2. 承载形式：从情境里挑最有沉浸感的「容器」，不要默认做成文章页。可选：手机界面（聊天、朋友圈、相册、通话、备忘录）、信件/日记/手账、电影分镜与字幕、游戏对话框（视觉小说）、案件档案/调查板、报纸杂志专题、旧电脑终端、监控画面、电台节目、卡牌、地图探索、时间轴等，可以组合。
3. 色板：1 个主色 + 1 个点缀色 + 2–3 个中性色，背景不用纯白纯黑。字体气质：标题与正文形成对比（如衬线标题 + 无衬线正文，或等宽字体做系统信息）。
4. 节奏：开场钩子 → 推进 → 情绪高点（最重要的交互放这里）→ 收尾与余韵（隐藏结局或彩蛋）。

二、文件结构
1. 只输出一个完整 HTML 文件：以 <!DOCTYPE html> 开头、</html> 结尾，前后不要任何说明文字，不要用 \`\`\` 代码围栏。
2. HTML + CSS + JavaScript 全部内联，不引用外部库、CDN、外部字体，不发起任何网络请求（fetch、XHR、WebSocket 都不要）。
3. <head> 里写 <meta charset="UTF-8"> 和 <meta name="viewport" content="width=device-width, initial-scale=1">。
4. 字体只用系统字体栈：无衬线 -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif；衬线 "Songti SC", "Noto Serif SC", "SimSun", serif；等宽 ui-monospace, "SF Mono", Consolas, monospace。
5. 所有 class / id 加统一短前缀（如 tt-）；设计变量（颜色、字号、间距、圆角、阴影、动效时长与缓动）全部写成 CSS 变量放在根容器上。

三、运行环境（必须遵守，否则会显示异常）
1. 页面运行在高度自动撑开的 iframe 里：不要用 100vh / 100dvh / height:100% 撑满屏幕，不要给 html、body 固定高度或 overflow:hidden；内容自然向下排布。「整屏」效果用 min-height: 560px 一类固定值或 aspect-ratio 实现。
2. 弹窗、抽屉、底部面板用 position:absolute 定位在根容器内，不要用 position:fixed 铺满全屏。
3. 无法使用 localStorage / sessionStorage / cookie（会报错），状态全部存在 JS 变量里。
4. 不要用 alert / confirm / prompt，用自己做的弹层代替。
5. 脚本放在 </body> 前；整体用 try/catch 包住，出错时剧情文字依然完整可读（内容写在 HTML 里，不要全靠 JS 生成）。

四、视觉设计（决定「高级感」，逐条落实）
1. 排版：建立明确的字号层级（例如 12 / 14 / 16 / 20 / 28 / 40px），标题字距略收紧，正文行高 1.7–1.9，每行约 18–32 个汉字；善用留白，留白比装饰更高级。
2. 构图：不要所有内容都是居中卡片。用不对称布局、错位叠放、超大标题、出血图形、分栏、边注、引用大字、编号章节等制造层次和视觉焦点。
3. 质感：用 CSS / SVG 做出材质——纸张颗粒（SVG feTurbulence 噪点）、胶片划痕与暗角、玻璃拟态（backdrop-filter）、扫描线、墨迹晕染、光斑、柔和多层阴影；选 1–2 种与概念相符的，克制使用。
4. 图形：图标统一用内联 SVG（线宽一致的线性图标），不要大量 emoji 当图标；插画、头像、场景用 SVG 绘制（剪影、几何、线描），或用 CSS 渐变构成光影氛围。
5. 光与色：用径向渐变做环境光、用 mix-blend-mode 或滤镜做氛围；避免满屏紫蓝渐变、霓虹堆砌、圆角卡片套娃这类模板化 AI 审美。
6. 对话呈现：不同角色有各自的颜色、对齐或字体；心声、旁白、系统消息、回忆片段用明显不同的样式（如斜体灰字、等宽字、褪色滤镜）。
7. 日间 / 夜间模式（必须支持）：
   - 两套配色都用 CSS 变量定义在根容器上（如 .tt-root 与 .tt-root[data-theme="dark"]），切换时只改 data-theme，所有颜色、背景、边框、阴影都引用变量。
   - 初始跟随系统 matchMedia('(prefers-color-scheme: dark)') 并监听变化，用户手动切换后不再跟随。
   - 右上角（手机端放顶部栏）放切换按钮（SVG 太阳 / 月亮 + aria-label），点击即时切换，配 200–300ms 颜色过渡。
   - 夜间不是简单反色：背景深但不纯黑（如 #14141a 一类），正文用柔和浅色，降低大面积高饱和色，插画适当降亮度；两种模式对比度都足够，风格仍贴合设定（如古风夜间是墨色与烛光暖黄，赛博夜间强化霓虹）。

五、动效（像电影一样有节奏）
1. 开场动画：进入页面时有 1–2 秒的开场（标题逐字浮现、镜头推近、信封展开、屏幕开机、胶片倒数等），可点击跳过。
2. 滚动叙事：用 IntersectionObserver 让段落、画面在进入视口时依次淡入、上移、模糊变清晰，错开 60–120ms；可做视差层次（背景慢、前景快）。
3. 关键台词用打字机效果逐字显示（可点击立即显示全文）；重要情绪点配合屏幕轻微震动、闪白、光晕扩散、粒子（花瓣、雪、雨、灰尘、萤火，用 canvas 或 CSS 实现，数量适中）。
4. 缓动统一用 cubic-bezier(.22,.61,.36,1) 或 cubic-bezier(.65,0,.35,1) 这类自然曲线，只动 transform / opacity / filter；时长 150–600ms，开场与转场可更长。
5. 支持 prefers-reduced-motion：用户偏好减少动画时关闭位移、粒子和震动，只保留淡入。

六、交互（至少 5 种，贯穿剧情而不是堆在末尾）
手机端常见交互必须完善支持：
- 点击 / 轻触：推进对话、翻转卡片、展开回忆、选择选项
- 长按（约 500ms，带进度环或缩放反馈）：听见心声、查看隐藏消息、撕开封条
- 左右滑动：翻页、切换角色视角、滑过照片；上下滑动：拉出底部抽屉
- 拖拽：拼合碎纸、移动物品、把信塞进信封、拉开窗帘或遮挡
- 双击：点赞、收藏、触发彩蛋
- 涂抹刮开（canvas）、滑块解锁、按住充能、摇晃/倾斜（DeviceOrientation 可选，必须有点击替代）
电脑端：hover 预览与光标跟随光效、点击、拖拽、滚轮、键盘（← → 翻页，空格推进，Esc 关闭弹层，Enter 确认）。
叙事型交互（按情境挑 2–3 个做深）：
- 分支选择影响后续文字和结局，结尾显示「你的选择」回顾，提供「重新开始」
- 好感度 / 心情 / 理智等数值条，随选择动画变化
- 收集线索或回忆碎片，集齐解锁隐藏结局或番外一句话
- 模拟手机：消息逐条弹出（带「对方正在输入…」）、可点开的照片、未接来电、撤回的消息
- 视角切换：同一事件分别看两个人的内心
实现要求：
- 统一用 Pointer Events（pointerdown / pointermove / pointerup）兼容鼠标和触摸；需要手势的区域设置合适的 touch-action，避免和页面滚动冲突；可点元素加 user-select:none 和 -webkit-tap-highlight-color:transparent。
- 每次操作都有即时反馈：按下态缩放、涟漪、状态过渡；可用 navigator.vibrate(10) 做轻触震动（先判断是否存在）。
- 第一次出现的手势给出优雅的提示（呼吸动画的小手势图标 + 一句话），不要让用户猜。
- 可点击元素用 <button> 或带 role / tabindex / aria-label，键盘可操作，focus-visible 有清晰样式。

七、手机端与电脑端（同一文件，排版要有明显区别）
1. 移动优先：默认手机竖屏单列，宽度 100%，不出现横向滚动；@media (min-width: 768px) 切换为电脑布局。
2. 手机端：正文 15–16px；可点区域至少 44×44px；主要操作放在拇指区（下方）；底部标签栏 / 抽屉 / 全宽卡片；左右边距 16px；适配刘海屏 env(safe-area-inset-*)。
3. 电脑端：内容最大宽度 720–1040px 居中；用双栏、侧边注释、多列画廊、悬浮细节让大屏更丰富，而不是把手机版拉宽。
4. 用 (hover: hover) 与 (pointer: coarse) 区分鼠标和触屏：触屏不要依赖 hover 才能看到的内容。
5. 图片、SVG、canvas、表格都要 max-width:100%；长文本 word-break 防溢出；canvas 按 devicePixelRatio 绘制保证清晰。

八、图片与素材
1. 优先用 CSS、内联 SVG、canvas 绘制一切视觉元素。
2. 确实需要外部图片时：只用你确定真实存在、可公开合法使用（CC0 / 免版权，或用户提供）的链接，内容只能是风景、物品、建筑、纹理、抽象图案；必须写 alt，并加 onerror 隐藏或替换为 CSS 占位。
3. 禁止使用真人照片、明星、网红或任何可识别的真实人物形象，禁止编造不确定的图片链接；人物一律用插画风 SVG、剪影或文字头像。
4. 禁止嵌入音视频外链、iframe、表单提交到外部地址。需要声音时可用 Web Audio API 合成极短的提示音，默认静音，由用户点击开启。

九、内容与完成度
1. 文字是作品的灵魂：剧情完整、有起承转合，文字量不少于纯文本版本；人物语气贴合设定，细节具体可感。
2. 不交互也能读完主线；交互和隐藏内容是加分项，不能让剧情只剩按钮。
3. 代码精简：复用样式类和函数，避免重复和冗余；优先保证剧情和核心交互完整，装饰效果其次。确保在输出上限内写完并闭合所有标签。
4. 输出前自检：没有外部请求、没有 100vh 和全屏 fixed、日夜间两套颜色都正确、手机和电脑都能操作、所有标签已闭合。`;

/** 纯文本格式要求：配合排版美化自动识别 */
function buildTutuTextFormatRules() {
    const typo = getTutuTypographyState();
    const rules = [
        '【输出格式：纯文本小剧场】',
        '1. 只输出纯文字，不要使用任何 HTML 标签、Markdown 标记（#、**、- 列表、```）或代码。',
        '2. 每个段落单独一行，段落之间空一行；不要在段首手动加空格缩进。',
        '3. 人物说的话用中文双引号“”包裹，可以写成「名字 + 动作：“台词”」，例如：林夏抬眼看他：“你又迟到了。”',
    ];

    if (typo.chatBubble) {
        rules.push('4. 如果情节里出现微信 / 短信 / 聊天记录，聊天内容每条单独一行写成「名字：消息内容」，可以在消息前单独一行写时间（如 22:10），图片、语音、转账用 [图片] [语音] [转账] 表示；聊天前用一句叙述交代是在微信或聊天软件里。');
    }

    return rules.join('\n');
}

function getTutuOutputFormat() {
    return tutuSettings.outputFormat === 'html' ? 'html' : 'text';
}

function getTutuHtmlPrompt() {
    return String(tutuSettings.htmlPromptCustom || '').trim() || TUTU_DEFAULT_HTML_PROMPT;
}

/** 告诉 AI 用户当前设备，便于把主要体验做在对应端 */
function getTutuDeviceHint() {
    try {
        const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
        const width = window.innerWidth || 0;

        return coarse || width < 768
            ? `当前用户正在使用手机 / 触屏设备浏览（屏幕宽度约 ${width}px），请把手机端体验作为重点，同时保留电脑端适配。`
            : `当前用户正在使用电脑浏览（窗口宽度约 ${width}px），请把电脑端体验作为重点，同时保留手机端适配。`;
    } catch (error) {
        return '';
    }
}

function buildTutuFormatRules(format = getTutuOutputFormat()) {
    if (format !== 'html') return buildTutuTextFormatRules();

    const hint = getTutuDeviceHint();

    return `${getTutuHtmlPrompt()}${hint ? `\n\n【使用端】\n${hint}` : ''}`;
}

function buildTutuContextPrompt(userScenario, format = getTutuOutputFormat()) {
    const characterName =
        tutuCurrentCharacterContext.characterName || 'AI';

    const characterDescription =
        tutuCurrentCharacterContext.description ||
        '当前角色没有提供角色描述。';

    const userPersona =
        tutuCurrentCharacterContext.userPersona ||
        '当前用户没有提供用户人设。';

    const selectedWorldEntries = getSelectedTutuWorldEntries();


    const worldBookText = selectedWorldEntries.length
        ? selectedWorldEntries
            .map((entry, index) => {
                return `【世界书条目 ${index + 1}：${entry.name}】\n${entry.content}`;
            })
            .join('\n\n')
        : '用户没有选择任何世界书条目。';

    const historyText = getTutuHistoryText();
const auxPromptsEnabled =
    Boolean(tutuSettings.auxPromptsEnabled);

const jailbreakText =
    auxPromptsEnabled ? joinTutuActiveAuxPromptText('jailbreak') : '';

const styleText =
    auxPromptsEnabled ? joinTutuActiveAuxPromptText('style') : '';

const extraText =
    auxPromptsEnabled ? joinTutuActiveAuxPromptText('extra') : '';

    let prompt = `
请根据以下信息，写一段关于「${characterName}」的外置小剧场。

【角色名称】
${characterName}

【角色描述】
${characterDescription}

【用户人设】
${userPersona}

【用户提供的情境】
${userScenario}

${jailbreakText
    ? `【破限提示词】\n${jailbreakText}\n`
    : ''}

${styleText
    ? `【文风提示词】\n${styleText}\n`
    : ''}

${extraText
    ? `【附加要求（必须遵守）】\n${extraText}\n`
    : ''}

【用户选择读取的世界书条目】
${worldBookText}

要求：
1. 这是独立于正文对话之外的番外内容。
2. 必须符合角色描述中的性格、身份、背景和说话方式。
3. 如果提供了用户人设，请让用户角色的身份、性格和行为符合用户人设。
4. 如果提供了世界书条目，请将其中相关设定自然地融入内容。
5. 内容要生动、有画面感、有一定故事性。
6. 不要解释你的写作过程。
7. 输出格式以末尾的【输出格式】为准；情境或剧本里对格式的描述与它冲突时，以【输出格式】为准，但保留情境里的题材和样式偏好。
`.trim();

    if (historyText) {
        prompt += `

【最近历史聊天记录】
${historyText}

请参考历史聊天记录中的人物关系、语气和当前剧情，但不要机械复制历史聊天内容。
`.trim();
    }

    // 格式要求放最后，离输出最近，模型最不容易忘
    prompt += `\n\n${buildTutuFormatRules(format)}`;

    return prompt;
}
function getRandomTutuScenario() {
    const scenarios = getTutuScenarioPool();

    if (!scenarios.length) {
        return null;
    }

    const index = Math.floor(
        Math.random() * scenarios.length
    );

    return scenarios[index];
}

function getSequenceTutuScenario() {
    const scenarios = getTutuScenarioPool();

    if (!scenarios.length) {
        return null;
    }

    const sequenceKey =
        getTutuScenarioSequenceKey();

    if (
        !tutuSettings.autoSequenceIndexes ||
        typeof tutuSettings.autoSequenceIndexes !== 'object'
    ) {
        tutuSettings.autoSequenceIndexes = {};
    }

    let index =
        Number(
            tutuSettings.autoSequenceIndexes[sequenceKey]
        ) || 0;

    if (index >= scenarios.length) {
        index = 0;
    }

    const scenario = scenarios[index];

    tutuSettings.autoSequenceIndexes[sequenceKey] =
        (index + 1) % scenarios.length;

    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(tutuSettings)
    );

    return scenario;
}

function getAutoGenerationScenario() {
    const mode =
        tutuSettings.autoGenerateMode || 'current';

    if (mode === 'random') {
        const scenario = getRandomTutuScenario();

        return scenario?.prompt || '';
    }

    if (mode === 'sequence') {
        const scenario = getSequenceTutuScenario();

        return scenario?.prompt || '';
    }

    return String(
        $('#tutu_prompt').val() || ''
    ).trim();
}

// 最近一次生成使用的情境，续写时沿用
let tutuLastGenerationScenario = '';
let tutuLastGenerationScenarioId = '';

/** 续写时发给 AI 的已生成内容上限，避免超出上下文 */
const TUTU_CONTINUE_MAX_CHARS = 12000;

function buildTutuContinuePrompt(basePrompt, previous) {
    const text = String(previous || '');
    const tail = text.length > TUTU_CONTINUE_MAX_CHARS
        ? text.slice(-TUTU_CONTINUE_MAX_CHARS)
        : text;
    const truncatedNote = tail.length < text.length
        ? '（以下只保留了已生成内容的末尾部分）\n'
        : '';

    return `${basePrompt}

【续写任务】
上一轮小剧场生成到一半中断了。下面是已经生成的内容，请严格从它的最后一个字符之后无缝继续写完：
- 不要重复已经写过的任何内容，不要从头重写，不要总结或解释
- 保持相同的格式、文风和人称；如果是 HTML，直接接着未完成的标签和代码往下写，并补全所有未闭合的标签
- 不要加代码块标记（\`\`\`），不要加任何前言
- 直接输出续写部分

【已生成内容】
${truncatedNote}${tail}`;
}

/**
 * 拼接续写结果：去掉 AI 重复输出的重叠部分。
 * 1. 续写以完整原文开头 → 视为 AI 重写了全文，直接用续写
 * 2. 原文末尾与续写开头重叠 → 去掉重叠
 */
function mergeTutuContinuation(previous, continuation) {
    const head = String(previous || '');
    let tail = String(continuation || '');

    if (!tail.trim()) return head;
    if (!head) return tail;

    if (tail.length > head.length && tail.startsWith(head.trimEnd())) {
        return tail;
    }

    const maxOverlap = Math.min(head.length, tail.length, 2000);

    // 至少 4 个字符才算重叠，避免误删正常的单字衔接
    for (let size = maxOverlap; size >= 4; size--) {
        if (head.endsWith(tail.slice(0, size))) {
            tail = tail.slice(size);
            break;
        }
    }

    // 原文以完整行结束时，续写开头的空行没有意义；否则原样直接接上
    if (/\n\s*$/.test(head)) {
        tail = tail.replace(/^\s*\n/, '');
    }

    return head + tail;
}

async function runTutuGeneration({
    scenario = '',
    isAutomatic = false,
    scenarioId = '',
    continueFrom = '',
} = {}) {
    if (tutuIsGenerating) {
        return;
    }

    scenario = String(scenario || '').trim();
    continueFrom = String(continueFrom || '');

    const isContinue = Boolean(continueFrom.trim());

    if (!scenario) {
        if (isAutomatic) {
            console.warn(
                '自动生成没有可用的剧本情境'
            );

            return;
        }

        toastr.warning('请先输入剧场情境！');
        return;
    }

    tutuIsGenerating = true;

    // 本次生成的令牌：取消后旧请求即使返回也会被丢弃
    const generationToken = {
        cancelled: false,
        controller:
            typeof AbortController === 'function'
                ? new AbortController()
                : null,
    };
    tutuCurrentGeneration = generationToken;

    const provider =
        $('#tutu_api_provider').val() || 'main';

    if (isContinue) {
        // 续写时保留已有内容，只更新状态
        $('#tutu_result_status').text('🐱 克制正在接着往下写……');
    } else {
        $('#tutu_result_status').text(
            isAutomatic
                ? '🐱 收到最新剧情，克制正在生成番外……'
                : '🐱 克制脑洞中……'
        );

        $('#tutu_result_preview').html(`
            <div class="tutu-result-placeholder">
                🐱 正在生成小剧场……
            </div>
        `);

        $('#tutu_result_source').text('');
    }

    setTutuGenerateButtonState(true);

    try {
await refreshTutuCharacterContext();

if (!isContinue) {
    tutuCurrentResultCharacter =
        getCurrentTutuCharacterName();
}

tutuLastGenerationScenario = scenario;
tutuLastGenerationScenarioId =
    scenarioId || findTutuScenarioIdByPrompt(scenario) || '';

// 续写沿用原内容的格式，不受生成区切换影响
const generationFormat = isContinue
    ? (isProbablyHtml(continueFrom) ? 'html' : 'text')
    : getTutuOutputFormat();

const basePrompt =
    buildTutuContextPrompt(scenario, generationFormat);

const aiPrompt = isContinue
    ? buildTutuContinuePrompt(basePrompt, continueFrom)
    : basePrompt;


        let result;

        if (generationToken.cancelled) {
            throw createTutuCancelError();
        }

        if (provider === 'secondary') {
            result =
                await generateBySecondaryApi(
                    aiPrompt,
                    generationToken.controller?.signal
                );
        } else {
            /*
             * generateRaw 本身不接收 signal，
             * 取消时调用酒馆的 stopGeneration 中断，
             * 同时用 Promise.race 让面板立即恢复。
             */
            result = await Promise.race([
                generateRaw({
                    prompt: aiPrompt,
                    quietToLoud: false,
                    isImpersonate: false,
                }),
                waitTutuGenerationCancel(generationToken),
            ]);
        }

        if (generationToken.cancelled) {
            throw createTutuCancelError();
        }

        if (isContinue) {
            // 续写部分只去掉代码块标记，保留开头空白以便无缝衔接
            const continuation = String(result || '')
                .replace(/^\s*```(?:html|HTML|xml|XML)?[ \t]*\r?\n?/, '')
                .replace(/\r?\n?\s*```\s*$/, '');

            if (!continuation.trim()) {
                throw new Error('续写没有返回新内容');
            }

            result = mergeTutuContinuation(continueFrom, continuation);
        } else {
            result = cleanGeneratedContent(result);

            if (generationFormat === 'html') {
                result = extractTutuHtmlDocument(result);
            }
        }

        // 记录内容来源剧本，供绑定条目的渲染正则使用
        rememberTutuContentScenario(
            result,
            tutuLastGenerationScenarioId
        );

        // ★ 根据输出方式决定结果去向
        const outputMode = tutuSettings.outputMode || 'panel';

if (outputMode === 'embed') {
    // 续写时替换楼层里那半截小剧场
    await embedTutuTheaterToChat(
        result,
        !isAutomatic || isContinue
    );

    showTutuResult(result);
} else {
    // 外置面板预览
    showTutuResult(result);
}

/*
 * 生成完成提示
 */
$('#tutu_result_status').text(
    (isContinue ? '续写完成' : '生成完成') +
    (outputMode === 'embed' ? '，已嵌入最新 AI 回复楼层。' : '。')
);

// HTML 没写到 </html> 多半是被回复长度截断了，提示续写
const htmlTruncated =
    isProbablyHtml(result) &&
    /<!doctype html|<html[\s>]/i.test(result) &&
    !/<\/html\s*>\s*$/i.test(String(result).trim());

if (htmlTruncated) {
    $('#tutu_result_status').text('HTML 似乎没写完（缺少 </html>），可点「续写」补完，或调大回复长度。');
    toastr.warning('HTML 没写完，可能被回复长度截断：点「续写」补完，或在酒馆 / 副 API 调大回复长度（建议 8000 tokens 以上）', '克制放映室');
} else if (isContinue) {
    toastr.success('已接着上文续写完成，可再次续写', '克制放映室');
} else if (outputMode === 'embed') {
    toastr.success(
        isAutomatic
            ? '已根据最新 AI 回复生成并嵌入小剧场'
            : '小剧场生成完成，并已嵌入聊天楼层',
        '克制放映室'
    );
} else {
    toastr.success(
        isAutomatic
            ? '已根据最新 AI 回复生成小剧场'
            : '小剧场生成完成',
        '克制放映室'
    );
}
} catch (error) {
    if (generationToken.cancelled || isTutuCancelError(error)) {
        $('#tutu_result_status').text('已取消生成。');

        $('#tutu_result_preview').html(`
            <div class="tutu-result-placeholder">
                已取消生成。
            </div>
        `);

        $('#tutu_result_source').text('');

        // 取消前面板上有结果时恢复显示
        if (String(tutuCurrentResultContent || '').trim()) {
            showTutuResult(tutuCurrentResultContent);
            $('#tutu_result_status').text('已取消生成，显示上一次的结果。');
        }

        return;
    }

    console.error(
        '小剧场生成失败：',
        error
    );

    const errorMessage =
        getTutuErrorMessage(error) ||
        '生成失败，请检查 API 配置';

    // 续写失败时保留原来的半截内容，不用错误覆盖
    if (isContinue) {
        showTutuResult(continueFrom);
        $('#tutu_result_status').text(`❌ 续写失败：${errorMessage}`);
        toastr.error(errorMessage, '克制放映室续写失败');
        return;
    }

    const displayError =
        `❌ 小剧场生成失败\n\n${errorMessage}`;

    $('#tutu_result_status')
        .text('❌ 生成失败，点击源码可查看详细原因');

    /*
     * 预览区显示错误原因
     */
    const $errorBox = $('<div>')
        .addClass('tutu-result-error')
        .text(displayError);

    $('#tutu_result_preview')
        .empty()
        .append($errorBox);

    /*
     * 源码区域也显示完整错误
     */
    $('#tutu_result_source')
        .text(displayError);

    /*
     * 手动生成和自动生成都提示错误
     */
    toastr.error(
        errorMessage,
        isAutomatic
            ? '克制放映室自动生成失败'
            : '克制放映室生成失败'
    );

} finally {
        // 只有当前这次生成才复位，避免影响取消后新开的生成
        if (tutuCurrentGeneration === generationToken) {
            tutuIsGenerating = false;
            tutuCurrentGeneration = null;
            setTutuGenerateButtonState(false);
        }
    }
}

// ==========================================
// 取消生成
// ==========================================
function createTutuCancelError() {
    const error = new Error('已取消生成');
    error.name = 'TutuCancelError';
    return error;
}

function isTutuCancelError(error) {
    return error?.name === 'TutuCancelError' || error?.name === 'AbortError';
}

function waitTutuGenerationCancel(token) {
    return new Promise((_, reject) => {
        if (token.cancelled) {
            reject(createTutuCancelError());
            return;
        }

        token.onCancel = () => reject(createTutuCancelError());
    });
}

function setTutuGenerateButtonState(isGenerating) {
    const $button = $('#tutu_generate_btn');

    $button
        .removeClass('disabled')
        .toggleClass('tutu-generating', isGenerating)
        .attr({
            title: isGenerating ? '取消生成' : '生成小剧场',
            'aria-label': isGenerating ? '取消生成' : '生成小剧场',
        });

    $button.find('i')
        .toggleClass('fa-wand-magic-sparkles', !isGenerating)
        .toggleClass('fa-stop', isGenerating);

    $('#tutu_random_script_btn').toggleClass('disabled', isGenerating);
    $('#tutu_continue_current_btn').toggleClass('disabled', isGenerating);
}

/**
 * 取消当前生成：
 * - 副 API：AbortController 中断 fetch
 * - 主 API：调用酒馆 stopGeneration 中断 generateRaw
 * 立即复位面板，旧请求晚到的结果会被丢弃。
 */
function cancelTutuGeneration() {
    const token = tutuCurrentGeneration;

    if (!token || token.cancelled) return;

    token.cancelled = true;

    try {
        token.controller?.abort();
    } catch (error) {
        console.warn('[克制放映室] 中断副 API 请求失败：', error);
    }

    try {
        const context = SillyTavern.getContext();

        if (typeof context.stopGeneration === 'function') {
            context.stopGeneration();
        } else {
            $('#mes_stop:visible').trigger('click');
        }
    } catch (error) {
        console.warn('[克制放映室] 中断主 API 生成失败：', error);
    }

    token.onCancel?.();

    tutuIsGenerating = false;
    tutuCurrentGeneration = null;
    setTutuGenerateButtonState(false);

    toastr.info('已取消生成', '克制放映室');
}
function getTutuLatestMessageKey() {
    const context =
        SillyTavern.getContext();

    const chat = Array.isArray(context.chat)
        ? context.chat
        : [];

    const lastMessage =
        chat[chat.length - 1];

    if (!lastMessage) {
        return '';
    }

    return [
        chat.length,
        lastMessage.mes ||
            lastMessage.content ||
            '',
        lastMessage.name || '',
    ].join('::');
}
/**
 * 获取当前聊天唯一标识
 *
 * 加入角色信息，避免不同角色之间复用同一个自动生成状态。
 */
function getTutuCurrentChatIdentity() {
    const context = SillyTavern.getContext();

    const chatId =
        context.chatId ||
        context.chat_metadata?.chat_id ||
        'default';

    const characterId =
        context.characterId !== undefined
            ? String(context.characterId)
            : 'none';

    const character =
        context.characterId !== undefined &&
        context.characters?.[context.characterId]
            ? context.characters[context.characterId]
            : null;

    const characterName =
        character?.name ||
        character?.data?.name ||
        'AI';

    const avatar =
        character?.avatar ||
        character?.data?.avatar ||
        '';

    return [
        chatId,
        characterId,
        characterName,
        avatar,
    ].join('::');
}


/**
 * 判断最新 AI 消息是否确实是在回复用户。
 *
 * 角色开场白通常前面没有用户消息，所以不会触发。
 * 只有聊天中出现用户消息后，后面的 AI 回复才允许自动生成。
 */
function getTutuLatestAiReplyInfo() {
    const context = SillyTavern.getContext();

    const chat = Array.isArray(context.chat)
        ? context.chat
        : [];

    if (!chat.length) {
        return null;
    }

    const latestIndex = chat.length - 1;
    const latestMessage = chat[latestIndex];

    /*
     * 第 0 层通常是角色开场白。
     * 无论它是不是 AI 消息，都不允许自动生成小剧场。
     */
    if (latestIndex === 0) {
        return null;
    }
    if (!latestMessage) {
        return null;
    }

    // 最新消息必须是 AI 消息
    if (latestMessage.is_user) {
        return null;
    }

    /*
     * 从最新 AI 消息往前找最近一条用户消息。
     *
     * 如果找不到，说明这是角色开场白，
     * 或者不是用户触发的回复。
     */
    let userIndex = -1;

    for (let i = latestIndex - 1; i >= 0; i--) {
        if (chat[i]?.is_user) {
            userIndex = i;
            break;
        }

        /*
         * 如果中间又出现了另一条 AI 消息，
         * 说明最新 AI 消息不是紧接着回复用户。
         *
         * 例如：
         * AI
         * AI
         *
         * 这种情况不自动生成。
         */
        if (!chat[i]?.is_user && chat[i]?.mes) {
            break;
        }
    }

    if (userIndex === -1) {
        return null;
    }

    return {
        latestIndex,
        latestMessage,
        userIndex,
    };
}


/**
 * 生成稳定的自动生成去重 Key。
 *
 * 不只使用 chat.length，
 * 还加入聊天、角色、楼层、消息正文。
 */
function getTutuAutoMessageKey(messageIndex, message) {
    const contextIdentity =
        getTutuCurrentChatIdentity();

    const messageText = String(
        message?.mes ||
        message?.content ||
        ''
    );

    return [
        contextIdentity,
        messageIndex,
        message?.name || '',
        messageText,
    ].join('::');
}

function initTutuAutoGenerationListener() {
    if (
        typeof eventSource === 'undefined' ||
        !event_types?.MESSAGE_RECEIVED
    ) {
        console.warn(
            '克制放映室：没有找到 MESSAGE_RECEIVED 事件'
        );

        return;
    }

    eventSource.on(
        event_types.MESSAGE_RECEIVED,
        async () => {
            try {
                const latestSettings =
                    loadLocalJson(
                        SETTINGS_KEY,
                        tutuSettings
                    );

                tutuSettings = {
                    ...tutuSettings,
                    ...latestSettings,
                };

                if (!tutuSettings.autoGenerateEnabled) {
                    return;
                }

                /*
                 * 关键判断：
                 * 最新 AI 消息必须是对用户消息的回复。
                 *
                 * 角色开场白前面没有用户消息，
                 * 因此会直接 return。
                 */
                const replyInfo =
                    getTutuLatestAiReplyInfo();

                if (!replyInfo) {
                    console.log(
                        '[克制放映室] 当前消息不是用户触发的 AI 回复，不自动生成'
                    );

                    return;
                }

const {
    latestIndex,
    latestMessage,
} = replyInfo;

/*
 * 双重保险：
 * 第 0 层永远不自动生成小剧场。
 */
if (latestIndex <= 0) {
    console.log(
        '[克制放映室] 第 0 层是角色开场白，跳过自动生成'
    );

    return;
}
                /*
                 * 如果这一层已经有小剧场标记，
                 * 说明这一层以前已经生成过。
                 *
                 * 自动模式下不再重复生成。
                 */
                const latestMesText = String(
                    latestMessage.mes ||
                    latestMessage.content ||
                    ''
                );

                if (
                    latestMesText.includes(
                        TUTU_THEATER_START
                    )
                ) {
                    console.log(
                        '[克制放映室] 当前 AI 楼层已经存在小剧场，跳过重复生成'
                    );

                    return;
                }

                const messageKey =
                    getTutuAutoMessageKey(
                        latestIndex,
                        latestMessage
                    );

                /*
                 * 防止同一个 MESSAGE_RECEIVED 事件、
                 * 消息更新事件重复触发。
                 */
                if (
                    messageKey &&
                    messageKey === tutuLastAutoMessageKey
                ) {
                    return;
                }

                tutuLastAutoMessageKey =
                    messageKey;

                const scenario =
                    getAutoGenerationScenario();

                if (!scenario) {
                    console.warn(
                        '克制放映室：当前自动生成范围内没有可用剧本'
                    );

                    return;
                }

                await runTutuGeneration({
                    scenario,
                    isAutomatic: true,
                });

            } catch (error) {
                console.error(
                    '克制放映室自动生成失败：',
                    error
                );
            }
        }
    );
}

// 监听聊天消息渲染完成，恢复嵌入的小剧场显示
function initTutuEmbedRestorer() {
    // 使用 MutationObserver 监听 .mes_text 的变化
    // 当 SillyTavern 重新渲染消息时，恢复小剧场 DOM

    if (typeof eventSource === 'undefined') {
        return;
    }

    // 聊天加载完成时恢复
    const restoreEvents = [
        event_types.CHAT_CHANGED,
        event_types.MESSAGE_UPDATED,
        event_types.CHARACTER_MESSAGE_RENDERED,
    ].filter(Boolean);

restoreEvents.forEach(eventType => {
    eventSource.on(eventType, () => {
        if (
            eventType === event_types.CHAT_CHANGED
        ) {
            tutuLastAutoMessageKey = '';
        }

        setTimeout(() => {
            restoreAllTutuTheaterEmbeds();
        }, 300);
    });
});

}

function restoreAllTutuTheaterEmbeds() {
    const context =
        SillyTavern.getContext();

    const chat =
        Array.isArray(context.chat)
            ? context.chat
            : [];

    chat.forEach((message, index) => {
        if (!message || message.is_user) {
            return;
        }

        const mes =
            String(message.mes || '');

        /*
         * 没有标记就不恢复。
         */
        if (
            !mes.includes(TUTU_THEATER_START)
        ) {
            return;
        }

        const $messageBlock =
            $(`.mes[mesid="${index}"]`);

        if (!$messageBlock.length) {
            return;
        }

        const $mesText =
            $messageBlock.find('.mes_text');

        if (!$mesText.length) {
            return;
        }

        /*
         * 已经有 DOM 就不要重复添加。
         */
        if (
            $mesText.find(
                '.tutu-theater-embed'
            ).length
        ) {
            return;
        }

        const storedTheater =
            getTutuStoredTheaterContent(index);

        if (
            !storedTheater ||
            !storedTheater.content
        ) {
            console.warn(
                '[克制放映室] 找不到对应楼层的小剧场内容：',
                index
            );

            return;
        }

appendTheaterToDOM(
    index,
    storedTheater.content,
    storedTheater.characterName,
    storedTheater.characterAvatar
);
    });
}


initTutuEmbedRestorer();
// ==========================================
// 自定义标签捕捉
// ==========================================

/**
 * 解析用户配置的捕捉标签名列表
 */
function getTutuCaptureTagNames() {
    const raw =
        String(tutuSettings.captureTagName || '').trim();

    if (!raw) {
        return [];
    }

    return raw
        .split(/[,，\s]+/)
        .map(tag => tag.trim().toLowerCase())
        .filter(Boolean)
        .filter(tag => /^[a-z][a-z0-9-]*$/i.test(tag));
}

/**
 * 为一个已经存在于 DOM 中的元素添加小剧场操作按钮
 */
function attachTutuCaptureActions(element) {
    /*
     * 防止重复处理
     */
    if (element.dataset.tutuCaptured === 'true') {
        return;
    }

    element.dataset.tutuCaptured = 'true';

    /*
     * 提取这个元素的内容
     *
     * 如果是 <details>，取其中 <summary> 之后的部分。
     * 否则取整个 innerHTML。
     */
    const tagName =
        element.tagName.toLowerCase();

    let capturedContent = '';

    if (tagName === 'details') {
        /*
         * 克隆节点，移除 summary，取剩余 HTML
         */
        const clone = element.cloneNode(true);
        const summary = clone.querySelector('summary');

        if (summary) {
            summary.remove();
        }

        capturedContent = clone.innerHTML.trim();
    } else {
        capturedContent = element.innerHTML.trim();
    }

    if (!capturedContent) {
        return;
    }

    /*
     * 获取角色名称
     */
    const $mesBlock =
        $(element).closest('.mes');

    let characterName = 'AI';

    if ($mesBlock.length) {
        characterName =
            $mesBlock.find('.ch_name .name_text').text().trim() ||
            'AI';
    }

    /*
     * 保存内容到 DOM 节点
     */
    element._tutuCapturedContent = capturedContent;
    element._tutuCapturedCharacter = characterName;

    /*
     * 创建操作按钮栏
     */
    const actionsBar = document.createElement('div');
    actionsBar.className = 'tutu-capture-actions-bar';

    const label = document.createElement('span');
    label.className = 'tutu-capture-label';
    label.textContent = '🐱 小剧场';

    const buttonsContainer = document.createElement('span');
    buttonsContainer.className = 'tutu-capture-buttons';

    function createCaptureButton(iconClass, titleText, handler) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tutu-capture-action-btn';
        btn.title = titleText;
        btn.innerHTML = `<i class="${iconClass}"></i>`;

        btn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            handler();
        });

        return btn;
    }

    const favoriteBtn = createCaptureButton(
        'fa-regular fa-heart',
        '收藏小剧场',
        () => {
            favoriteTutuContent(
                element._tutuCapturedContent,
                element._tutuCapturedCharacter
            );
        }
    );

    const exportBtn = createCaptureButton(
        'fa-solid fa-file-export',
        '导出小剧场',
        () => {
            exportTutuContent(
                element._tutuCapturedContent,
                element._tutuCapturedCharacter
            );
        }
    );

    const fullscreenBtn = createCaptureButton(
        'fa-solid fa-expand',
        '全屏查看',
        () => {
            openTutuTheaterFullscreen(
                element._tutuCapturedContent,
                element._tutuCapturedCharacter
            );
        }
    );

    buttonsContainer.appendChild(favoriteBtn);
    buttonsContainer.appendChild(exportBtn);
    buttonsContainer.appendChild(fullscreenBtn);

    actionsBar.appendChild(label);
    actionsBar.appendChild(buttonsContainer);

    /*
     * 将按钮栏插入到元素内部的顶部
     *
     * 如果是 <details>，插在 <summary> 后面
     */
    if (tagName === 'details') {
        const summary = element.querySelector('summary');

        if (summary) {
            summary.after(actionsBar);
        } else {
            element.prepend(actionsBar);
        }
    } else {
        element.prepend(actionsBar);
    }

    /*
     * 给元素加上视觉标记
     */
    element.classList.add('tutu-captured-element');

    // 纯文本小剧场应用排版美化；HTML 小剧场保持原样
    if (isTutuCapturedPlainText(capturedContent)) {
        element.classList.add('tutu-typo-rendered');
    }
}

/**
 * 扫描所有聊天消息，捕捉指定标签
 */
function scanAndCaptureTutuTags() {
    const tagNames = getTutuCaptureTagNames();

    if (!tagNames.length) {
        return;
    }

    const selector = tagNames
        .map(tag => `.mes_text ${tag}:not([data-tutu-captured="true"])`)
        .join(', ');

    const elements = document.querySelectorAll(selector);

    elements.forEach(element => {
        attachTutuCaptureActions(element);
    });
}

/**
 * 初始化自动捕捉监听
 */
function initTutuCaptureListener() {
    /*
     * 首次扫描
     */
    setTimeout(() => {
        scanAndCaptureTutuTags();
    }, 500);

    /*
     * 监听消息渲染事件
     */
    if (typeof eventSource !== 'undefined') {
        const captureEvents = [
            event_types.CHARACTER_MESSAGE_RENDERED,
            event_types.MESSAGE_UPDATED,
            event_types.CHAT_CHANGED,
        ].filter(Boolean);

        captureEvents.forEach(eventType => {
            eventSource.on(eventType, () => {
                setTimeout(() => {
                    scanAndCaptureTutuTags();
                }, 400);
            });
        });
    }

    /*
     * 使用 MutationObserver 作为兜底方案
     *
     * 当 SillyTavern 动态渲染消息时，
     * 事件可能不够及时，
     * Observer 可以确保不遗漏。
     */
    const chatContainer =
        document.getElementById('chat');

    if (chatContainer) {
        const observer = new MutationObserver(() => {
            scanAndCaptureTutuTags();
        });

        observer.observe(chatContainer, {
            childList: true,
            subtree: true,
        });
    }
}

/*
 * 启动捕捉监听
 */
initTutuCaptureListener();

function normalizeSecondaryApiBase(endpoint) {
    endpoint = String(endpoint || '')
        .trim()
        .replace(/\/+$/, '');

    if (!endpoint) {
        throw new Error('没有填写副 API 地址');
    }

    /*
     * 兼容：
     * https://api.example.com
     * https://api.example.com/v1
     * https://api.example.com/v1/chat/completions
     * https://api.example.com/v1/models
     */
    endpoint = endpoint
        .replace(/\/chat\/completions\/?$/i, '')
        .replace(/\/models\/?$/i, '')
        .replace(/\/+$/, '');

    if (!/\/v1$/i.test(endpoint)) {
        endpoint += '/v1';
    }

    return endpoint;
}
async function fetchSecondaryModels() {
    const endpointInput = $('#tutu_secondary_endpoint').val().trim();
    const baseUrl = normalizeSecondaryApiBase(endpointInput);
    const apiKey = $('#tutu_secondary_api_key').val().trim();

    const $btn = $('#tutu_fetch_models_btn');
    const $select = $('#tutu_secondary_model');

    // 记住当前已选模型，拉取完成后尽量还原
    const previousModel =
        String($select.val() || tutuSettings.model || '').trim();

    $btn.addClass('disabled');

    $select
        .empty()
        .append($('<option>', { value: '', text: '正在拉取模型……' }));

    try {
        const headers = { 'Content-Type': 'application/json' };

        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${baseUrl}/models`, {
            method: 'GET',
            headers,
        });

        const responseText = await response.text();

        if (!response.ok) {
if (!response.ok) {
    let detail = responseText;

    try {
        const errorData = JSON.parse(responseText);

        detail =
            errorData?.error?.message ||
            errorData?.error ||
            errorData?.message ||
            errorData?.detail ||
            JSON.stringify(errorData, null, 2);
    } catch {
        detail = responseText;
    }

    throw new Error(
        [
            `拉取模型失败`,
            `HTTP 状态码：${response.status}`,
            detail
                ? `错误原因：${String(detail)}`
                : '',
        ]
            .filter(Boolean)
            .join('\n')
    );
}
        }

        let data;

        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error('副 API 返回的不是 JSON：\n' + responseText);
        }

        // 兼容 OpenAI 的 { data: [...] }，也兼容直接返回数组
        const rawList = Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
                ? data.data
                : Array.isArray(data?.models)
                    ? data.models
                    : [];

        const models = Array.from(
            new Set(
                rawList
                    .map(item => {
                        if (typeof item === 'string') {
                            return item;
                        }

                        return String(item?.id || item?.name || '').trim();
                    })
                    .filter(Boolean)
            )
        ).sort((a, b) => a.localeCompare(b));

        if (!models.length) {
            throw new Error('副 API 没有返回任何模型');
        }

        $select.empty();

        $select.append(
            $('<option>', { value: '', text: '请选择模型' })
        );

        models.forEach(model => {
            $select.append(
                $('<option>', { value: model, text: model })
            );
        });

        if (previousModel) {
            if (!models.includes(previousModel)) {
                $select.append(
                    $('<option>', {
                        value: previousModel,
                        text: `${previousModel}（已保存）`,
                    })
                );
            }

            $select.val(previousModel);
        }

        toastr.success(`拉取到 ${models.length} 个模型`);

    } catch (error) {
        // 失败时把下拉框恢复成可用状态，不要卡在"正在拉取"
        $select.empty();

        if (previousModel) {
            $select.append(
                $('<option>', {
                    value: previousModel,
                    text: `${previousModel}（已保存）`,
                })
            );

            $select.val(previousModel);
        } else {
            $select.append(
                $('<option>', { value: '', text: '请先拉取模型' })
            );
        }

        throw error;

    } finally {
        $btn.removeClass('disabled');
    }
}

/** 最大输出长度：空 / 0 / 非法值返回 0（表示不发送），否则取整并限制在 1–200000 */
function normalizeTutuMaxTokens(value) {
    const number = Math.floor(Number(value));

    if (!Number.isFinite(number) || number <= 0) return 0;

    return Math.min(number, 200000);
}

async function generateBySecondaryApi(prompt, signal) {
    const endpointInput =
        $('#tutu_secondary_endpoint').val().trim();

    const baseUrl =
        normalizeSecondaryApiBase(endpointInput);

    const endpoint =
        `${baseUrl}/chat/completions`;

    const apiKey =
        $('#tutu_secondary_api_key').val().trim();

const model = String($('#tutu_secondary_model').val() || '').trim();


    if (!model) {
        throw new Error(
            '请先拉取模型并选择一个模型'
        );
    }

    const headers = {
        'Content-Type': 'application/json',
    };

    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    const requestBody = {
        model,
        messages: [
            {
                role: 'user',
                content: prompt,
            }
        ],
        temperature: 0.8,
    };

    // 留空不发送，交给接口默认值
    const maxTokens = normalizeTutuMaxTokens(tutuSettings.secondaryMaxTokens);

    if (maxTokens) {
        requestBody.max_tokens = maxTokens;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal,
    });

    const responseText = await response.text();
if (!response.ok) {
    let detail = responseText;

    try {
        const errorData = JSON.parse(responseText);

        detail =
            errorData?.error?.message ||
            errorData?.error ||
            errorData?.message ||
            errorData?.detail ||
            JSON.stringify(errorData, null, 2);
    } catch {
        // 返回的不是 JSON，直接使用原始文本
        detail = responseText;
    }

    throw new Error(
        [
            `副 API 请求失败`,
            `HTTP 状态码：${response.status}`,
            detail
                ? `错误原因：${String(detail)}`
                : '',
        ]
            .filter(Boolean)
            .join('\n')
    );
}


    let data;

    try {
        data = JSON.parse(responseText);
    } catch {
        return responseText;
    }

    const result =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.text ??
        data?.output_text ??
        data?.output ??
        data?.content ??
        data?.text;

    // 被最大输出长度截断：提示调大，内容照常返回
    if (data?.choices?.[0]?.finish_reason === 'length') {
        toastr.warning(
            maxTokens
                ? `输出达到最大长度 ${maxTokens} 被截断，可点「续写」或在设置里调大最大输出长度`
                : '输出被接口默认长度截断，可点「续写」或在设置里填写最大输出长度',
            '克制放映室'
        );
    }

    if (result === undefined || result === null) {
        throw new Error(
            '副 API 返回的数据中没有找到文本内容：\n' +
            JSON.stringify(data, null, 2)
        );
    }

    if (Array.isArray(result)) {
        return result
            .map(item => {
                if (typeof item === 'string') {
                    return item;
                }

                return item?.text || item?.content || '';
            })
            .join('');
    }

    return String(result);
}


function saveTutuSettings() {
    tutuSettings = {
        // 保留未在此列出的字段（排版、历史默认、防截断等），避免点保存时被清空
        ...tutuSettings,

        provider:
            $('#tutu_api_provider').val() || 'main',

        endpoint:
            String($('#tutu_secondary_endpoint').val() || '').trim(),

        apiKey:
            String($('#tutu_secondary_api_key').val() || '').trim(),

        model:
            String($('#tutu_secondary_model').val() || '').trim(),

        secondaryMaxTokens:
            normalizeTutuMaxTokens($('#tutu_secondary_max_tokens').val()),

        autoGenerateEnabled:
            $('#tutu_auto_generate_enabled').is(':checked'),

        autoGenerateMode:
            $('#tutu_auto_generate_mode').val() || 'current',

        autoGenerateScope:
            $('#tutu_auto_generate_scope').val() || 'all',

        autoGenerateCategory:
            $('#tutu_auto_generate_category').val() || '',

        autoSequenceIndex:
            Number(tutuSettings.autoSequenceIndex) || 0,

        autoSequenceIndexes:
            tutuSettings.autoSequenceIndexes || {},
auxPromptsEnabled:
    $('#tutu_aux_prompts_enabled').is(':checked'),

// 破限 / 文风 / 附加的勾选由各自的复选框直接写入，这里原样保留
activeJailbreakPromptId:
    String(tutuSettings.activeJailbreakPromptId || ''),

activeStylePromptId:
    String(tutuSettings.activeStylePromptId || ''),

activeAuxPromptIds: {
    jailbreak: [...getTutuActiveAuxIds('jailbreak')],
    style: [...getTutuActiveAuxIds('style')],
    extra: [...getTutuActiveAuxIds('extra')],
},
outputMode:
    $('#tutu_output_mode').val() || 'panel',

embedDefaultCollapsed:
    $('#tutu_embed_default_state').val() === 'collapsed',
captureTagName:
    $('#tutu_capture_tag_name').val().trim(),
uiTheme:
    normalizeTutuUiTheme(
        $('#tutu_ui_theme').val()
    ),

uiCustomCss:
    String(
        $('#tutu_ui_custom_css').val() || ''
    ),

stylePresetIds: {
    ...tutuSettings.stylePresetIds,
},

renderRegexEnabled:
    tutuSettings.renderRegexEnabled !== false,

renderCssEnabled:
    tutuSettings.renderCssEnabled !== false,

historyIncludeTags:
    String(tutuSettings.historyIncludeTags || ''),

historyExcludeTags:
    String(tutuSettings.historyExcludeTags || ''),

historyExcludeComments:
    tutuSettings.historyExcludeComments !== false,

    };

    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(tutuSettings)
    );

    updateAutoGenerateStatus();
}
function renderTutuAuxPromptPresetSelect() {
    const type =
        String(
            $('#tutu_aux_prompt_type').val() ||
            'jailbreak'
        );

    const $select =
        $('#tutu_aux_prompt_preset');

    if (!$select.length) {
        return;
    }

    const previous =
        String($select.val() || '');

    $select.empty().append(
        $('<option>', {
            value: '',
            text: '新建提示词',
        })
    );

    const list =
        tutuAuxPrompts[type] || [];

    list.forEach(item => {
        $select.append(
            $('<option>', {
                value: item.id,
                text: item.name,
            })
        );
    });

    if (
        previous &&
        list.some(item => item.id === previous)
    ) {
        $select.val(previous);
    } else {
        $select.val('');
    }
}

function updateTutuAuxActiveCount(type) {
    const count = getActiveTutuAuxPrompts(type).length;

    $(`.tutu-aux-active-count[data-type="${type}"]`)
        .text(count ? `（已选 ${count}）` : '（未使用）');
}

/** 三类提示词渲染成复选框列表，可多选 */
function renderTutuActiveAuxPromptSelects() {
    AUX_PROMPT_TYPES.forEach(type => {
        const $list = $(`.tutu-aux-checklist[data-type="${type}"]`);

        if (!$list.length) return;

        const items = tutuAuxPrompts[type] || [];

        // 清掉已删除的 id
        const validIds = getTutuActiveAuxIds(type)
            .filter(id => items.some(item => item.id === id));
        setTutuActiveAuxIds(type, validIds);

        $list.empty();

        if (!items.length) {
            $list.append(
                $('<div>', {
                    class: 'tutu-aux-checklist-empty',
                    text: `还没有${getTutuAuxPromptTypeLabel(type)}提示词，可在下方新建或从预设导入`,
                })
            );
        }

        items.forEach(item => {
            const $label = $('<label>', {
                class: 'tutu-aux-check-item',
                title: item.content.slice(0, 300),
            });

            $('<input>', {
                type: 'checkbox',
                class: 'tutu-aux-active-checkbox',
                'data-type': type,
                value: item.id,
            })
                .prop('checked', validIds.includes(item.id))
                .appendTo($label);

            $('<span>', { text: item.name }).appendTo($label);

            $list.append($label);
        });

        updateTutuAuxActiveCount(type);
    });
}
function updateTutuAuxPromptVisibility() {
    const enabled =
        $('#tutu_aux_prompts_enabled').is(':checked');

    const $body =
        $('#tutu_aux_prompt_settings_body');

    if (!$body.length) {
        return;
    }

    if (enabled) {
        $body.stop(true, true).slideDown(160);
    } else {
        $body.stop(true, true).slideUp(160);
    }
}

function updateTutuAuxPromptEditorStatus() {
    const type =
        String(
            $('#tutu_aux_prompt_type').val() ||
            'jailbreak'
        );

    const id =
        String(
            $('#tutu_aux_prompt_preset').val() ||
            ''
        );

    const label =
        getTutuAuxPromptTypeLabel(type);

    const record =
        id
            ? findTutuAuxPrompt(type, id)
            : null;

    if (record) {
        $('#tutu_aux_edit_status').text(
            `正在修改${label}提示词：「${record.name}」`
        );

        $('#tutu_save_aux_prompt_btn_text').text(
            '保存修改'
        );
    } else {
        $('#tutu_aux_edit_status').text(
            `当前正在新建${label}提示词`
        );

        $('#tutu_save_aux_prompt_btn_text').text(
            '保存新提示词'
        );
    }
}

function renderTutuAuxPromptManager() {
    renderTutuAuxPromptPresetSelect();
    renderTutuActiveAuxPromptSelects();
    updateTutuAuxPromptEditorStatus();
}


function clearTutuAuxPromptEditor() {
    $('#tutu_aux_prompt_preset').val('');
    $('#tutu_aux_prompt_name').val('');
    $('#tutu_aux_prompt_content').val('');

    updateTutuAuxPromptEditorStatus();
}

function loadTutuAuxPromptIntoEditor(type, id) {
    const record =
        findTutuAuxPrompt(type, id);

    if (!record) {
        $('#tutu_aux_prompt_name').val('');
        $('#tutu_aux_prompt_content').val('');

        updateTutuAuxPromptEditorStatus();
        return;
    }

    $('#tutu_aux_prompt_name')
        .val(record.name);

    $('#tutu_aux_prompt_content')
        .val(record.content);

    updateTutuAuxPromptEditorStatus();
}

function renderApiPresetDropdown() {
    const $select = $('#tutu_api_preset_select');

    if (!$select.length) return;

    $select.empty();

    $select.append(
        $('<option>', {
            value: '',
            text: '选择已保存的副 API 预设'
        })
    );

    tutuApiPresets.forEach((preset, index) => {
        $select.append(
            $('<option>', {
                value: String(index),
                text: preset.name
            })
        );
    });
}
const TUTU_UI_THEMES = new Set([
    'classic',
    'cream',
    'neumorphic',
    'editorial',
    'polaroid',
    'archive',
    'custom',
]);



const TUTU_CUSTOM_STYLE_ID =
    'tutu_theater_user_custom_style';

function normalizeTutuUiTheme(theme) {
    let value = String(theme || '').trim();

    /*
     * 已删除的旧主题统一迁移到拍立得
     */
    if (
        value === 'terminal' ||
        value === 'instagram' ||
        value === 'breeze' ||
        value === 'sakura'
    ) {
        value = 'polaroid';
    }

    return TUTU_UI_THEMES.has(value)
        ? value
        : 'classic';
}

function installTutuCustomCss(css) {
    let styleElement =
        document.getElementById(
            TUTU_CUSTOM_STYLE_ID
        );

    if (!styleElement) {
        styleElement =
            document.createElement('style');

        styleElement.id =
            TUTU_CUSTOM_STYLE_ID;

        document.head.appendChild(
            styleElement
        );
    }

    /*
     * 使用 textContent，不把 CSS 当作 HTML 插入。
     * 自定义 CSS 仍然是可信的本地高级功能。
     */
    styleElement.textContent =
        String(css || '');
}

function updateTutuThemeControls(theme) {
    const normalizedTheme =
        normalizeTutuUiTheme(theme);

    $('#tutu_ui_theme').val(
        normalizedTheme
    );

    $('.tutu-theme-preview')
        .removeClass('active')
        .filter(
            `[data-theme="${normalizedTheme}"]`
        )
        .addClass('active');

    if (normalizedTheme === 'custom') {
        $('#tutu_ui_custom_css_box')
            .stop(true, true)
            .slideDown(160);
    } else {
        $('#tutu_ui_custom_css_box')
            .stop(true, true)
            .slideUp(160);
    }
}

function applyTutuUiTheme(
    theme = tutuSettings.uiTheme,
    customCss = tutuSettings.uiCustomCss
) {
    const normalizedTheme =
        normalizeTutuUiTheme(theme);

    const panel =
        document.getElementById(
            'tutu_theater_panel'
        );

    if (panel) {
        panel.dataset.tutuTheme =
            normalizedTheme;
    }

    /*
     * 自定义 CSS 只在选择 custom 时启用。
     * 切回内置主题后不会继续污染内置样式。
     */
    installTutuCustomCss(
        normalizedTheme === 'custom'
            ? customCss
            : ''
    );

    updateTutuThemeControls(
        normalizedTheme
    );
}

function saveAndApplyTutuUiTheme(theme) {
    tutuSettings.uiTheme =
        normalizeTutuUiTheme(theme);

    tutuSettings.uiCustomCss =
        String(
            $('#tutu_ui_custom_css').val() || ''
        );

    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(tutuSettings)
    );

    applyTutuUiTheme(
        tutuSettings.uiTheme,
        tutuSettings.uiCustomCss
    );
}

function loadTutuSettingsToUI() {
    $('#tutu_api_provider')
        .val(tutuSettings.provider || 'main');

    $('#tutu_secondary_endpoint')
        .val(tutuSettings.endpoint || '');

    $('#tutu_secondary_api_key')
        .val(tutuSettings.apiKey || '');

    setTutuSecondaryModelValue(tutuSettings.model || '');

    const maxTokens = normalizeTutuMaxTokens(tutuSettings.secondaryMaxTokens);
    $('#tutu_secondary_max_tokens').val(maxTokens || '');

    $('#tutu_auto_generate_enabled')
        .prop(
            'checked',
            Boolean(tutuSettings.autoGenerateEnabled)
        );

    $('#tutu_auto_generate_scope')
        .val(tutuSettings.autoGenerateScope || 'all');

    $('#tutu_auto_generate_category')
        .val(tutuSettings.autoGenerateCategory || '');

    $('#tutu_auto_generate_mode')
        .val(tutuSettings.autoGenerateMode || 'current');

    // ★ 新增
    $('#tutu_output_mode')
        .val(tutuSettings.outputMode || 'panel');
    $('#tutu_embed_default_state')
    .val(
        tutuSettings.embedDefaultCollapsed
            ? 'collapsed'
            : 'expanded'
    );
$('#tutu_capture_tag_name')
    .val(tutuSettings.captureTagName || '');
$('#tutu_ui_theme').val(
    normalizeTutuUiTheme(
        tutuSettings.uiTheme
    )
);

$('#tutu_ui_custom_css').val(
    tutuSettings.uiCustomCss || ''
);
$('#tutu_aux_prompts_enabled')
    .prop(
        'checked',
        Boolean(tutuSettings.auxPromptsEnabled)
    );

applyTutuUiTheme(
    tutuSettings.uiTheme,
    tutuSettings.uiCustomCss
);
renderTutuStylePresetSelects();
updateTutuAuxPromptVisibility();

renderTutuAuxPromptManager();
    updateSecondaryApiVisibility();
    renderApiPresetDropdown();
    updateAutoGenerateStatus();
}



/**
 * 模型下拉框在拉取前没有选项，直接 .val() 会变成空。
 * 已保存的模型不在列表里时，补一个「已保存」选项再选中。
 */
function setTutuSecondaryModelValue(model) {
    const value = String(model || '').trim();
    const $select = $('#tutu_secondary_model');

    if (!$select.length) return;

    if (!value) {
        $select.val('');
        return;
    }

    const exists = $select
        .find('option')
        .toArray()
        .some(option => option.value === value);

    if (!exists) {
        $select.append(
            $('<option>', {
                value,
                text: `${value}（已保存）`,
            })
        );
    }

    $select.val(value);
}

function updateSecondaryApiVisibility() {
    const provider = $('#tutu_api_provider').val();

    if (provider === 'secondary') {
        $('#tutu_secondary_api_settings').show();
    } else {
        $('#tutu_secondary_api_settings').hide();
    }
}
function updateAutoGenerateStatus() {
    const enabled = Boolean(tutuSettings.autoGenerateEnabled);

    const $status = $('#tutu_auto_status');

    if (!$status.length) {
        return;
    }

    const label = enabled ? '自动生成已开启' : '手动生成';

    $status
        .toggleClass('enabled', enabled)
        .attr('title', label)
        .attr('aria-label', label)
        .html('<i class="fa-solid fa-circle"></i>');
}


function saveCurrentApiPreset() {
    const name = $('#tutu_api_preset_name').val().trim();
    const endpoint = $('#tutu_secondary_endpoint').val().trim();
    const apiKey = $('#tutu_secondary_api_key').val().trim();
    const model = $('#tutu_secondary_model').val().trim();

    if (!name) {
        toastr.warning('请输入预设名称');
        return;
    }

    if (!endpoint) {
        toastr.warning('请输入副 API 地址');
        return;
    }

if (!model) {
    toastr.warning('请先拉取并选择一个模型');
    return;
}


    const preset = {
        name,
        endpoint,
        apiKey,
        model,
        maxTokens: normalizeTutuMaxTokens($('#tutu_secondary_max_tokens').val()),
    };

    const oldIndex = tutuApiPresets.findIndex(item => item.name === name);

    if (oldIndex >= 0) {
        tutuApiPresets[oldIndex] = preset;
    } else {
        tutuApiPresets.push(preset);
    }

    localStorage.setItem(
        API_PRESETS_KEY,
        JSON.stringify(tutuApiPresets)
    );

    renderApiPresetDropdown();

    toastr.success(`副 API 预设「${name}」已保存`);
}

function loadSelectedApiPreset() {
    const index = Number($('#tutu_api_preset_select').val());

    if (!Number.isInteger(index) || !tutuApiPresets[index]) {
        toastr.warning('请选择一个副 API 预设');
        return;
    }

    const preset = tutuApiPresets[index];

    $('#tutu_secondary_endpoint').val(preset.endpoint || '');
    $('#tutu_secondary_api_key').val(preset.apiKey || '');
    const presetModel = String(preset.model || '');

const $modelSelect =
    $('#tutu_secondary_model');

if (
    presetModel &&
    !$modelSelect.find(
        `option[value="${CSS.escape(presetModel)}"]`
    ).length
) {
    $modelSelect.append(
        $('<option>', {
            value: presetModel,
            text: `${presetModel}（预设）`
        })
    );
}

$modelSelect.val(presetModel);

    // 旧预设没有这个字段时保留当前值
    if (Object.prototype.hasOwnProperty.call(preset, 'maxTokens')) {
        const presetMaxTokens = normalizeTutuMaxTokens(preset.maxTokens);

        $('#tutu_secondary_max_tokens').val(presetMaxTokens || '');
        tutuSettings.secondaryMaxTokens = presetMaxTokens;
        persistTutuSettings();
    }

    $('#tutu_api_preset_name').val(preset.name || '');

    toastr.success(`已载入副 API 预设：${preset.name}`);
}

function deleteSelectedApiPreset() {
    const index = Number($('#tutu_api_preset_select').val());

    if (!Number.isInteger(index) || !tutuApiPresets[index]) {
        toastr.warning('请选择一个副 API 预设');
        return;
    }

    const preset = tutuApiPresets[index];

    if (!confirm(`确定要删除副 API 预设「${preset.name}」吗？`)) {
        return;
    }

    tutuApiPresets.splice(index, 1);

    localStorage.setItem(
        API_PRESETS_KEY,
        JSON.stringify(tutuApiPresets)
    );

    renderApiPresetDropdown();

    toastr.success('副 API 预设已删除');
}

let editingScriptIndex = -1;
let tutuBatchManageEnabled = false;

const tutuBatchSelectedIndexes =
    new Set();

function updateTutuBatchSelectedCount() {
    $('#tutu_batch_selected_count').text(
        `已选择 ${tutuBatchSelectedIndexes.size} 个剧本`
    );

    const total =
        $('.tutu-batch-script-checkbox').length;

    const selected =
        $('.tutu-batch-script-checkbox:checked')
            .length;

    $('#tutu_batch_select_all').prop(
        'checked',
        total > 0 && selected === total
    );

    $('#tutu_batch_select_all').prop(
        'indeterminate',
        selected > 0 && selected < total
    );
}

function renderTutuBatchCategorySelect() {
    const $select =
        $('#tutu_batch_target_category');

    if (!$select.length) {
        return;
    }

    const previous =
        String($select.val() || '');

    const categories =
        getAllTutuCategories();

    $select.empty();

    if (!categories.length) {
        $select.append(
            $('<option>', {
                value: '',
                text: '没有可用分类',
            })
        );

        return;
    }

    categories.forEach(category => {
        $select.append(
            $('<option>', {
                value: category,
                text: category,
            })
        );
    });

    if (categories.includes(previous)) {
        $select.val(previous);
    } else {
        $select.prop('selectedIndex', 0);
    }
}

function setTutuBatchManageEnabled(enabled) {
    tutuBatchManageEnabled =
        Boolean(enabled);

    if (!tutuBatchManageEnabled) {
        tutuBatchSelectedIndexes.clear();
    }

    $('#tutu_batch_manage_btn')
        .toggleClass(
            'active',
            tutuBatchManageEnabled
        );

    $('#tutu_batch_manage_panel')
        .toggle(tutuBatchManageEnabled);

    $('#tutu_library_list')
        .toggleClass(
            'tutu-batch-mode',
            tutuBatchManageEnabled
        );

    renderTutuBatchCategorySelect();
    renderLibrary();
    updateTutuBatchSelectedCount();
}

function moveSelectedTutuScenariosToCategory(
    targetCategory
) {
    targetCategory =
        String(targetCategory || '').trim();

    if (!targetCategory) {
        toastr.warning('请选择目标分类');
        return;
    }

    const indexes =
        Array.from(tutuBatchSelectedIndexes)
            .map(Number)
            .filter(index =>
                Number.isInteger(index) &&
                index >= 0 &&
                tutuScenarios[index]
            );

    if (!indexes.length) {
        toastr.warning('请至少选择一个剧本');
        return;
    }

    indexes.forEach(index => {
        tutuScenarios[index].category =
            targetCategory;
    });

    if (
        !tutuCategories.includes(
            targetCategory
        )
    ) {
        tutuCategories.push(
            targetCategory
        );
    }

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );

    saveTutuCategories();

    tutuExpandedCategories.add(
        targetCategory
    );

    saveTutuExpandedCategories();

    const movedCount =
        indexes.length;

    tutuBatchSelectedIndexes.clear();

    renderLibrary();
    renderTutuCategorySelects();
    renderTutuBatchCategorySelect();
    updateTutuBatchSelectedCount();

    toastr.success(
        `已将 ${movedCount} 个剧本移动到「${targetCategory}」`
    );
}

function openScriptEditor(index = -1) {
    editingScriptIndex = index;

    $('#tutu_script_editor').show();

if (index === -1) {
    $('#tutu_editor_title').text('新建剧本');
    $('#tutu_script_name').val('');
    $('#tutu_script_desc').val('');
    $('#tutu_script_category').val('未分类');
    $('#tutu_script_prompt').val('');
} else {
    const item = tutuScenarios[index];

    $('#tutu_editor_title').text('编辑剧本');
    $('#tutu_script_name').val(item.name || '');
    $('#tutu_script_desc').val(item.desc || '');
    $('#tutu_script_category').val(
        item.category || '未分类'
    );
    $('#tutu_script_prompt').val(item.prompt || '');
}


    $('#tutu_script_name').trigger('focus');
}
function getTutuScenarioCategories() {
    const categories = new Set();

    tutuScenarios.forEach(item => {
        const category =
            String(item?.category || '未分类').trim() ||
            '未分类';

        categories.add(category);
    });

    return Array.from(categories).sort((a, b) =>
        a.localeCompare(b, 'zh-CN')
    );
}
function renderTutuImportCategorySelect() {
    const $select =
        $('#tutu_import_category');

    if (!$select.length) {
        return;
    }

    const previous =
        String($select.val() || '');

    const categories =
        getAllTutuCategories();

    $select.empty();

    if (!categories.length) {
        $select.append(
            $('<option>', {
                value: '',
                text: '没有可用分类',
            })
        );

        return;
    }

    categories.forEach(category => {
        $select.append(
            $('<option>', {
                value: category,
                text: category,
            })
        );
    });

    if (categories.includes(previous)) {
        $select.val(previous);
    } else if (categories.includes('未分类')) {
        $select.val('未分类');
    } else {
        $select.prop('selectedIndex', 0);
    }
}

function updateTutuImportCategoryVisibility() {
    const target =
        String(
            $('#tutu_import_target').val() ||
            'scenario'
        );

    // 预设正则只能导入到渲染正则库，不需要目标和分类
    if ($('#tutu_preset_type').val() === 'openai_regex') {
        $('#tutu_import_target').hide();
        $('#tutu_import_category').hide();
        return;
    }

    $('#tutu_import_target').show();

    if (target === 'scenario') {
        renderTutuImportCategorySelect();

        $('#tutu_import_category')
            .show();
    } else {
        $('#tutu_import_category')
            .hide();
    }
}

function renderTutuCategorySelects() {
    const categories = getTutuScenarioCategories();

    renderTutuExportCategorySelect();
    renderTutuImportCategorySelect();


    const currentAutoCategory =
        tutuSettings.autoGenerateCategory || '';



    const $autoSelect =
        $('#tutu_auto_generate_category');



    if ($autoSelect.length) {
        $autoSelect.empty();

        $autoSelect.append(
            $('<option>', {
                value: '',
                text: '全部分类',
            })
        );

        categories.forEach(category => {
            $autoSelect.append(
                $('<option>', {
                    value: category,
                    text: category,
                })
            );
        });

        if (categories.includes(currentAutoCategory)) {
            $autoSelect.val(currentAutoCategory);
        } else {
            $autoSelect.val('');
        }
    }

    updateAutoCategoryVisibility();
}

function updateAutoCategoryVisibility() {
    const scope =
        $('#tutu_auto_generate_scope').val() ||
        tutuSettings.autoGenerateScope ||
        'all';

    if (scope === 'category') {
        $('#tutu_auto_generate_category').show();
    } else {
        $('#tutu_auto_generate_category').hide();
    }
}

function getTutuScenarioPool() {
    if (!Array.isArray(tutuScenarios)) {
        return [];
    }

    const scope =
        tutuSettings.autoGenerateScope || 'all';

    const category =
        tutuSettings.autoGenerateCategory || '';

    if (scope !== 'category' || !category) {
        return tutuScenarios;
    }

    return tutuScenarios.filter(item => {
        const itemCategory =
            String(item?.category || '未分类').trim() ||
            '未分类';

        return itemCategory === category;
    });
}

function getTutuScenarioSequenceKey() {
    const scope =
        tutuSettings.autoGenerateScope || 'all';

    const category =
        tutuSettings.autoGenerateCategory || '';

    if (scope === 'category' && category) {
        return `category:${category}`;
    }

    return 'all';
}

function getAllTutuCategories() {
    const categories = new Set();

    tutuCategories.forEach(category => {
        const value = String(category || '').trim();

        if (value) {
            categories.add(value);
        }
    });

    tutuScenarios.forEach(item => {
        const category =
            String(item?.category || '未分类').trim() ||
            '未分类';

        categories.add(category);
    });

    return Array.from(categories).sort((a, b) =>
        a.localeCompare(b, 'zh-CN')
    );
}

function saveTutuCategories() {
    tutuCategories = Array.from(
        new Set(
            tutuCategories
                .map(category => String(category || '').trim())
                .filter(Boolean)
        )
    );

    localStorage.setItem(
        CATEGORIES_KEY,
        JSON.stringify(tutuCategories)
    );
}
// ==========================================
// 小剧场导入导出
// ==========================================

function getTutuExportScenarioData() {
    const scope =
        String($('#tutu_export_scope').val() || 'all');

    const selectedCategory =
        String($('#tutu_export_category').val() || '').trim();

    const allScenarios =
        Array.isArray(tutuScenarios)
            ? tutuScenarios
            : [];

    let scenarios;

    if (scope === 'category' && selectedCategory) {
        scenarios = allScenarios.filter(item => {
            const category =
                String(item?.category || '未分类').trim() ||
                '未分类';

            return category === selectedCategory;
        });
    } else {
        scenarios = allScenarios;
    }

    const categories = Array.from(
        new Set(
            scenarios.map(item => {
                return String(
                    item?.category || '未分类'
                ).trim() || '未分类';
            })
        )
    );

    return {
        scope,
        selectedCategory,
        categories,
        scenarios: scenarios.map(item => ({
            name: String(item?.name || '未命名剧本'),
            desc: String(item?.desc || ''),
            category:
                String(item?.category || '未分类').trim() ||
                '未分类',
            prompt: String(item?.prompt || ''),
        })),
    };
}


function createTutuTheaterPackage() {
    const data =
        getTutuExportScenarioData();

    return {
        type: TUTU_PACKAGE_TYPE,
        version: TUTU_PACKAGE_VERSION,

        exportedAt: new Date().toISOString(),

        categories: data.categories,

        scenarios: data.scenarios,
    };
}


function exportTutuJsonPackage() {
    const packageData =
        createTutuTheaterPackage();

    if (!packageData.scenarios.length) {
        toastr.warning('当前没有可以导出的剧本');
        return;
    }

    const json =
        JSON.stringify(packageData, null, 2);

    const blob = new Blob(
        [json],
        {
            type: 'application/json;charset=utf-8',
        }
    );

    const scope =
        $('#tutu_export_scope').val() || 'all';

    const category =
        $('#tutu_export_category').val() || '';

    const suffix =
        scope === 'category' && category
            ? `-${category}`
            : '-全部';

    const filename =
        sanitizeTutuFilename(
            `克制放映室${suffix}`
        ) + '.json';

    downloadTutuBlob(blob, filename);

    toastr.success('克制放映室 JSON 导出成功');
}

function exportTutuSingleScenario(index) {
    index = Number(index);

    if (
        !Number.isInteger(index) ||
        index < 0 ||
        !tutuScenarios[index]
    ) {
        toastr.error('找不到要导出的剧本');
        return;
    }

    const item = tutuScenarios[index];

    const name =
        String(item.name || '未命名剧本').trim();

    const desc =
        String(item.desc || '').trim();

    const category =
        String(item.category || '未分类').trim() ||
        '未分类';

    const prompt =
        String(item.prompt || '').trim();

    if (!prompt) {
        toastr.warning('这个剧本没有正文内容，无法导出');
        return;
    }

    /*
     * 使用和批量导出完全相同的克制放映室 JSON 格式。
     *
     * 这样导出的单个剧本可以直接使用：
     * “导入克制 JSON”
     * 再导入到剧本库。
     */
    const packageData = {
        type: TUTU_PACKAGE_TYPE,
        version: TUTU_PACKAGE_VERSION,

        exportedAt: new Date().toISOString(),

        categories: [
            category,
        ],

        scenarios: [
            {
                name,
                desc,
                category,
                prompt,
            },
        ],
    };

    const json =
        JSON.stringify(packageData, null, 2);

    const blob = new Blob(
        [json],
        {
            type: 'application/json;charset=utf-8',
        }
    );

    const filename =
        sanitizeTutuFilename(
            `克制放映室-${category}-${name}`
        ) + '.json';

    downloadTutuBlob(blob, filename);

    toastr.success(
        `剧本「${name}」导出成功`,
        '克制放映室'
    );
}

function exportTutuSillyTavernPreset() {
    const packageData =
        createTutuTheaterPackage();

    if (!packageData.scenarios.length) {
        toastr.warning('当前没有可以导出的剧本');
        return;
    }

    /*
     * 每一个小剧场剧本对应一个独立条目。
     *
     * identifier 用于 prompt_order 关联。
     * prompt_order 很重要：
     * 它告诉 SillyTavern 这些 prompts 是当前预设中的有效条目。
     */
    const prompts =
        packageData.scenarios.map((item, index) => {
            const identifier =
                `tutu_theater_${Date.now()}_${index}`;

            const promptName =
                `[${item.category}] ${item.name}`;

            const promptContent = [
                `小剧场名称：${item.name}`,
                `所属分类：${item.category}`,

                item.desc
                    ? `简介：${item.desc}`
                    : '',

                '',
                item.prompt,
            ]
                .filter(Boolean)
                .join('\n');

            return {
                identifier,
                name: promptName,

                /*
                 * SillyTavern Chat Completion 常用字段
                 */
                role: 'system',
                content: promptContent,

                /*
                 * 让它成为一个真正的提示词条目，
                 * 而不是只作为普通文本存在。
                 */
                system_prompt: true,
                marker: false,
                enabled: true,

                /*
                 * 兼容部分 SillyTavern 版本的字段
                 */
                injection_position: 0,
                injection_depth: 4,
                injection_order: index,

                forbid_overrides: false,
            };
        });

    /*
     * prompt_order 是关键。
     *
     * 不同 SillyTavern 版本对 character_id 的处理略有区别，
     * 这里使用一个通用的全局预设条目。
     */
    const promptOrder = [{
        character_id: 100001,

        order: prompts.map(prompt => ({
            identifier: prompt.identifier,
            enabled: true,
        })),
    }];

    const preset = {
        name: '克制放映室预设',

        /*
         * 当前版本通常读取 prompts
         */
        prompts,

        /*
         * prompt_order 决定条目如何排列和是否启用
         */
        prompt_order: promptOrder,

        /*
         * 以下字段是常见兼容字段
         */
        temperature: 0.8,
        openai_max_tokens: 1024,
        openai_max_context: 4096,
    };

    const json =
        JSON.stringify(preset, null, 2);

    const blob = new Blob(
        [json],
        {
            type: 'application/json;charset=utf-8',
        }
    );

    const filename =
        sanitizeTutuFilename(
            '克制放映室-SillyTavern对话补全预设'
        ) + '.json';

    downloadTutuBlob(blob, filename);

    toastr.success(
        `已导出 ${prompts.length} 个预设条目`
    );
}


function exportTutuSillyTavernWorldbook() {
    const packageData =
        createTutuTheaterPackage();

    if (!packageData.scenarios.length) {
        toastr.warning('当前没有可以导出的剧本');
        return;
    }

    /*
     * SillyTavern 世界书格式。
     *
     * 一个小剧场剧本对应一个世界书条目。
     */
    const worldbook = {
        name: '克制放映室世界书',

        entries: packageData.scenarios.map((item, index) => ({
            uid: index,

            key: [
                '克制放映室',
                item.category,
                item.name,
            ],

            comment:
                `[${item.category}] ${item.name}`,

            content: [
                `小剧场名称：${item.name}`,
                `所属分类：${item.category}`,

                item.desc
                    ? `简介：${item.desc}`
                    : '',

                '',
                item.prompt,
            ]
                .filter(Boolean)
                .join('\n'),

            enabled: true,
            constant: false,
            selective: true,
            secondary_keys: [],

            position: 0,
            order: index,

            /*
             * 保存克制放映室自己的分类信息。
             * 不认识 extensions 的程序也不会影响正常使用。
             */
            extensions: {
                tutuCategory: item.category,
                tutuScenarioName: item.name,
            },
        })),
    };

    const json =
        JSON.stringify(worldbook, null, 2);

    const blob = new Blob(
        [json],
        {
            type: 'application/json;charset=utf-8',
        }
    );

    const filename =
        sanitizeTutuFilename(
            '克制放映室-SillyTavern世界书'
        ) + '.json';

    downloadTutuBlob(blob, filename);

    toastr.success(
        'SillyTavern 世界书导出成功'
    );
}
function renderTutuExportCategorySelect() {
    const $select =
        $('#tutu_export_category');

    if (!$select.length) {
        return;
    }

    const categories =
        getAllTutuCategories();

    const previous =
        String($select.val() || '');

    $select.empty();

    if (!categories.length) {
        $select.append(
            $('<option>', {
                value: '',
                text: '没有可用分类',
            })
        );

        return;
    }

    categories.forEach(category => {
        $select.append(
            $('<option>', {
                value: category,
                text: category,
            })
        );
    });

    if (categories.includes(previous)) {
        $select.val(previous);
    } else {
        $select.prop('selectedIndex', 0);
    }
}
function getTutuImportedPromptText(prompt) {
    if (!prompt) {
        return '';
    }

    if (typeof prompt === 'string') {
        return prompt.trim();
    }

    return String(
        prompt.content ||
        prompt.prompt ||
        prompt.value ||
        prompt.text ||
        ''
    ).trim();
}


function getTutuImportedPromptName(prompt, index) {
    if (!prompt) {
        return `导入剧本 ${index + 1}`;
    }

    return String(
        prompt.name ||
        prompt.title ||
        `导入剧本 ${index + 1}`
    ).trim();
}


function getTutuCategoryFromImportedName(name) {
    const text = String(name || '').trim();

    /*
     * 识别：
     * [日常] 剧本名称
     * 【日常】剧本名称
     */
    const squareMatch =
        text.match(/^\[([^\]]+)\]\s*(.*)$/);

    if (squareMatch) {
        return {
            category:
                squareMatch[1].trim() || '未分类',

            name:
                squareMatch[2].trim() || '未命名剧本',
        };
    }

    const chineseMatch =
        text.match(/^【([^】]+)】\s*(.*)$/);

    if (chineseMatch) {
        return {
            category:
                chineseMatch[1].trim() || '未分类',

            name:
                chineseMatch[2].trim() || '未命名剧本',
        };
    }

    return {
        category: '未分类',
        name: text || '未命名剧本',
    };
}


function convertImportedDataToTutuScenarios(data) {
    if (
        !data ||
        data.type !== TUTU_PACKAGE_TYPE ||
        !Array.isArray(data.scenarios)
    ) {
        throw new Error(
            '这不是克制放映室导出的 JSON 文件'
        );
    }

    const imported = [];

    data.scenarios.forEach(item => {
        if (!item || typeof item !== 'object') {
            return;
        }

        const prompt =
            String(item.prompt || '').trim();

        if (!prompt) {
            return;
        }

        imported.push({
            name:
                String(
                    item.name || '导入剧本'
                ).trim(),

            desc:
                String(item.desc || '').trim(),

            category:
                String(
                    item.category || '未分类'
                ).trim() || '未分类',

            prompt,
        });
    });

    return imported;
}



function mergeTutuImportedScenarios(importedScenarios) {
    if (!Array.isArray(importedScenarios)) {
        return 0;
    }

    let importedCount = 0;

    importedScenarios.forEach(item => {
        if (!item || !String(item.prompt || '').trim()) {
            return;
        }

        const category =
            String(
                item.category || '未分类'
            ).trim() || '未分类';

        const newScenario = {
            name:
                String(
                    item.name || '导入剧本'
                ).trim(),

            desc:
                String(item.desc || '').trim(),

            category,

            prompt:
                String(item.prompt || '').trim(),
        };

        tutuScenarios.push(newScenario);

        if (!tutuCategories.includes(category)) {
            tutuCategories.push(category);
        }

        importedCount++;
    });

    if (importedCount > 0) {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(tutuScenarios)
        );

        saveTutuCategories();

        renderLibrary();
        renderTutuCategorySelects();
    }

    return importedCount;
}


async function importTutuLibraryFile(file) {
    if (!file) {
        return;
    }

    let text;

    try {
        text = await file.text();
    } catch (error) {
        throw new Error(
            '读取文件失败：' +
            (error.message || error)
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            '导入文件不是有效的 JSON'
        );
    }

    const importedScenarios =
        convertImportedDataToTutuScenarios(data);

    if (!importedScenarios.length) {
        throw new Error(
            '文件中没有找到可导入的剧本内容'
        );
    }

    const importedCount =
        mergeTutuImportedScenarios(
            importedScenarios
        );

    toastr.success(
        `成功导入 ${importedCount} 个小剧场剧本`
    );
}
function renderTutuStylePresetSelect(target, selector) {
    const $select = $(selector);

    if (!$select.length) return;

    const current =
        tutuSettings.stylePresetIds[target] || '';

    $select.empty().append(
        $('<option>', {
            value: '',
            text: '选择已保存样式',
        })
    );

    tutuStyleLibrary[target].forEach(item => {
        $select.append(
            $('<option>', {
                value: item.id,
                text: item.name,
            })
        );
    });

    $select.val(current);
}

function renderTutuStylePresetSelects() {
    renderTutuStylePresetSelect(
        'manager',
        '#tutu_manager_style_preset'
    );

    renderTutuStylePresetSelect(
        'quote',
        '#tutu_quote_style_preset'
    );
}

function renderLibrary() {
    // 导入 / 新建的剧本统一补 id
    ensureTutuScenarioIds();

    const $list = $('#tutu_library_list');

    if (!$list.length) {
        return;
    }

    $list.empty();

    const categories = getAllTutuCategories();
// 清掉已经不存在的分类
Array.from(tutuExpandedCategories).forEach(category => {
    if (!categories.includes(category)) {
        tutuExpandedCategories.delete(category);
    }
});

// 首次使用默认全部展开
if (!tutuExpandedInitialized && categories.length) {
    categories.forEach(category => tutuExpandedCategories.add(category));
    tutuExpandedInitialized = true;
}

saveTutuExpandedCategories();



    if (!categories.length) {
        $list.html(`
            <div class="tutu-empty-library">
                <i class="fa-solid fa-book-open"></i>
                <div>还没有分类</div>
                <small>请先创建一个分类</small>
            </div>
        `);

        return;
    }

    categories.forEach(category => {
        const categoryItems = tutuScenarios
            .map((item, index) => ({
                item,
                index,
            }))
            .filter(({ item }) => {
                const itemCategory =
                    String(item?.category || '未分类').trim() ||
                    '未分类';

                return itemCategory === category;
            });

        const isExpanded = tutuExpandedCategories.has(category);

        const $section = $(`
            <div
                class="tutu-category-section${isExpanded ? ' expanded' : ''}"
                data-category="${escapeHtml(category)}">

                <div
                    class="tutu-category-header tutu-category-drop-target"
                    data-category="${escapeHtml(category)}"
                    title="点击展开或折叠，也可以把剧本拖到这里">

                    <div class="tutu-category-title">
                        <i class="fa-solid fa-folder"></i>
                        <span>${escapeHtml(category)}</span>
                        <span class="tutu-category-count">
                            ${categoryItems.length} 个剧本
                        </span>
                    </div>

                    <i class="fa-solid fa-chevron-down tutu-category-arrow"></i>
                </div>

                <div
                    class="tutu-category-dropzone tutu-category-drop-target"
                    data-category="${escapeHtml(category)}">
                </div>
            </div>
        `);


        const $dropzone = $section.find('.tutu-category-dropzone');

        if (categoryItems.length === 0) {
            $dropzone.html(`
                <div class="tutu-category-empty">
                    把剧本拖到这里
                </div>
            `);
        } else {
            categoryItems.forEach(({ item, index }) => {
                const name =
                    escapeHtml(item.name || '未命名剧本');

                const desc =
                    escapeHtml(item.desc || '暂无简介');

                const prompt =
                    escapeHtml(item.prompt || '');

const $item = $(`
    <div
        class="tutu-preset-card tutu-script-card"
        data-index="${index}">

        <label
            class="tutu-batch-script-selector"
            title="选择这个剧本">

            <input
                type="checkbox"
                class="tutu-batch-script-checkbox"
                data-index="${index}"
                ${tutuBatchSelectedIndexes.has(index)
                    ? 'checked'
                    : ''}>
        </label>

        <div class="tutu-script-main">
                            <div class="tutu-script-name">
                                ${name}
                            </div>

                            <div class="tutu-script-desc">
                                ${desc}
                            </div>

                            <div
                                class="tutu-script-content"
                                style="display:none;">
                                ${prompt}
                            </div>
                        </div>

                        <div class="tutu-script-actions">

                            <div
                                class="menu_button margin0 tutu-icon-btn tutu-load-script-btn"
                                data-index="${index}"
                                title="载入剧本">
                                <i class="fa-solid fa-play"></i>
                            </div>

                            <div
                                class="menu_button margin0 tutu-icon-btn tutu-view-script-btn"
                                data-index="${index}"
                                title="查看剧本内容">
                                <i class="fa-solid fa-eye"></i>
                            </div>
<div
    class="menu_button margin0 tutu-icon-btn tutu-export-script-btn"
    data-index="${index}"
    title="导出这个剧本">
    <i class="fa-solid fa-file-export"></i>
</div>
                            <div
                                class="menu_button margin0 tutu-icon-btn tutu-edit-script-btn"
                                data-index="${index}"
                                title="编辑剧本">
                                <i class="fa-solid fa-pen"></i>
                            </div>

                            <div
                                class="menu_button margin0 tutu-icon-btn tutu-delete-script-btn"
                                data-index="${index}"
                                title="删除剧本">
                                <i class="fa-solid fa-trash-can"></i>
                            </div>

                        </div>
                    </div>
                `);

                $dropzone.append($item);
            });
        }

        $list.append($section);
    });
$('#tutu_library_list').toggleClass(
    'tutu-batch-mode',
    tutuBatchManageEnabled
);

updateTutuBatchSelectedCount();

    saveTutuCategories();
}

async function fetchAndRenderNativePrompts() {

        const $list = $('#tutu_native_prompts_list');
        const type = $('#tutu_preset_type').val(); // 'sysprompt' 或 'openai'
        const fileName = $('#tutu_preset_file').val();
        
        if (!fileName) return;
        
        $list.html('<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> 读取中...</div>');
        $('#tutu_select_all').prop('checked', false);

let allPrompts = [];
let data = null;

try {
    // ================================
    // 世界书
    // ================================
    if (type === 'worldbook') {
        data = await loadWorldInfo(fileName);

        if (!data) {
            throw new Error('世界书内容为空');
        }



        // SillyTavern 世界书的 entries 通常是对象：
        // {
        //     uid1: {...},
        //     uid2: {...}
        // }
        const entries = Array.isArray(data.entries)
            ? data.entries
            : Object.values(data.entries || {});

        entries.forEach((entry, index) => {
            if (!entry) return;

            const promptText = String(entry.content || '').trim();

            // 没有正文的条目不导入
            if (!promptText) return;

            let entryName =
                entry.comment ||
                entry.name ||
                (Array.isArray(entry.key)
                    ? entry.key.join(', ')
                    : entry.key) ||
                `世界书条目 ${index + 1}`;

            // 给禁用条目加一个标记，但仍然允许用户手动选择导入
            if (entry.enabled === false) {
                entryName = `🚫 [禁用] ${entryName}`;
            }

            allPrompts.push({
                name: entryName,
                prompt: promptText
            });
        });
    }

    // ================================
    // 对话补全预设
    // ================================
    else if (type === 'openai') {
        const manager = getPresetManager('openai');

        if (!manager) {
            throw new Error('找不到对话补全预设管理器');
        }

        data = await manager.getCompletionPresetByName(fileName);

        if (!data) {
            throw new Error('对话补全预设内容为空');
        }



        const pmArray = data.prompts || data.prompt_manager || [];

        pmArray.forEach(p => {
            if (!p) return;

            const promptText =
                p.content ||
                p.prompt ||
                p.value ||
                p.text ||
                '';

            if (p.name && String(promptText).trim()) {
                allPrompts.push({
                    name: p.name,
                    prompt: String(promptText)
                });
            }
        });
    }

    // ================================
    // 对话补全预设绑定的正则
    // ================================
    else if (type === 'openai_regex') {
        const manager = getPresetManager('openai');

        if (!manager) {
            throw new Error('找不到对话补全预设管理器');
        }

        data = await manager.getCompletionPresetByName(fileName);

        if (!data) {
            throw new Error('对话补全预设内容为空');
        }

        const scripts = getTutuPresetRegexScripts(data);

        scripts.forEach((script, index) => {
            if (!script || !script.findRegex) return;

            let entryName =
                script.scriptName || `预设正则 ${index + 1}`;

            if (script.disabled) {
                entryName = `🚫 [禁用] ${entryName}`;
            }

            allPrompts.push({
                name: entryName,
                prompt:
                    `查找：${script.findRegex}\n\n替换为：\n${script.replaceString ?? ''}`,
                regexScript: script,
            });
        });
    }
}
catch (error) {
    console.error('读取预设或世界书失败:', error);

    $list.html(
        '<div style="text-align:center; color:red; padding:20px;">' +
        '读取失败，请检查控制台。' +
        '</div>'
    );

    return;
}



        if (allPrompts.length === 0) {
            window.tutuTempNativePrompts = [];
            $list.html(
                type === 'openai_regex'
                    ? '<div style="text-align:center; padding: 20px; opacity:0.6;">这个预设没有绑定任何正则。</div>'
                    : '<div style="text-align:center; padding: 20px; opacity:0.6;">选中的预设中没有任何内容。</div>'
            );
            return;
        }

        window.tutuTempNativePrompts = allPrompts;
        $list.empty();

        // 渲染列表：带【查看】按钮和默认隐藏的正文内容区
        allPrompts.forEach((p, index) => {
            // 转义后再拼进模板，避免条目里的 HTML / 正则替换内容被直接执行
            const name = escapeHtml(p.name || "未命名");
            const promptText = escapeHtml(p.prompt);

            const $card = $(`
                <div class="tutu-preset-card" style="display: flex; flex-direction: column; gap: 5px;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="checkbox" class="tutu-import-checkbox" value="${index}" style="width: 18px; height: 18px; cursor: pointer;">
                        <div class="tutu-preset-name" style="flex:1; margin:0; cursor: pointer;">${name}</div>
                        <!-- 查看按钮 -->
                        <div class="menu_button margin0 tutu-view-btn" data-index="${index}" style="font-size:0.8em; padding: 5px 10px; min-width: 60px; justify-content: center;">
                            <i class="fa-solid fa-eye"></i> 查看
                        </div>
                    </div>
                    <!-- 隐藏的正文内容 -->
                    <div
    class="tutu-preset-text tutu-hidden-content-${index}"
    style="
        display:none;
        margin-top:5px;
        background:var(--SmartThemeBlurTintColor);
        color:var(--SmartThemeBodyColor);
        padding:8px;
        border-radius:5px;
        white-space:pre-wrap;
        word-break:break-all;
        max-height:150px;
        overflow-y:auto;
    "
>${promptText}</div>

                </div>
            `);
            $list.append($card);
        });

        // 绑定全选框反向更新逻辑
        $('.tutu-import-checkbox').on('change', function() {
            const total = $('.tutu-import-checkbox').length;
            const checked = $('.tutu-import-checkbox:checked').length;
            $('#tutu_select_all').prop('checked', total === checked);
        });

        // 点击条目名字，触发多选框选中/取消选中
        $('.tutu-preset-name').on('click', function() {
            const $checkbox = $(this).prev('.tutu-import-checkbox');
            $checkbox.prop('checked', !$checkbox.prop('checked')).trigger('change');
        });

        // 绑定“查看”按钮的展开/折叠逻辑
        $('.tutu-view-btn').on('click', function() {
            const index = $(this).data('index');
            const $content = $('.tutu-hidden-content-' + index);
            $content.slideToggle(150); 
        });
    }







    // ==========================================
    // 4. 事件绑定
    // ==========================================
    $(document).on(
    'change',
    '#tutu_import_target',
    function () {
        updateTutuImportCategoryVisibility();
    }
);
    $(document).on(
    'change',
    '#tutu_aux_prompts_enabled',
    function () {
        tutuSettings.auxPromptsEnabled =
            $(this).is(':checked');

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        updateTutuAuxPromptVisibility();

        toastr.info(
            tutuSettings.auxPromptsEnabled
                ? '已启用破限 / 文风 / 附加提示词'
                : '已停用破限 / 文风 / 附加提示词'
        );
    }
);
    $(document).on(
    'click',
    '#tutu_batch_manage_btn',
    function () {
        setTutuBatchManageEnabled(
            !tutuBatchManageEnabled
        );
    }
);

$(document).on(
    'click',
    '#tutu_batch_cancel_btn',
    function () {
        setTutuBatchManageEnabled(false);
    }
);

$(document).on(
    'change',
    '.tutu-batch-script-checkbox',
    function () {
        const index =
            Number($(this).attr('data-index'));

        if (!Number.isInteger(index)) {
            return;
        }

        if ($(this).is(':checked')) {
            tutuBatchSelectedIndexes.add(index);
        } else {
            tutuBatchSelectedIndexes.delete(index);
        }

        updateTutuBatchSelectedCount();
    }
);

$(document).on(
    'change',
    '#tutu_batch_select_all',
    function () {
        const checked =
            $(this).is(':checked');

        $('.tutu-batch-script-checkbox')
            .each(function () {
                const index =
                    Number(
                        $(this).attr('data-index')
                    );

                $(this).prop(
                    'checked',
                    checked
                );

                if (!Number.isInteger(index)) {
                    return;
                }

                if (checked) {
                    tutuBatchSelectedIndexes.add(
                        index
                    );
                } else {
                    tutuBatchSelectedIndexes.delete(
                        index
                    );
                }
            });

        updateTutuBatchSelectedCount();
    }
);

$(document).on(
    'click',
    '#tutu_batch_move_btn',
    function () {
        const category =
            String(
                $('#tutu_batch_target_category').val() ||
                ''
            );

        moveSelectedTutuScenariosToCategory(
            category
        );
    }
);
$(document).on(
    'change',
    '#tutu_aux_prompt_type',
    function () {
        clearTutuAuxPromptEditor();
        renderTutuAuxPromptPresetSelect();
    }
);

$(document).on(
    'change',
    '#tutu_aux_prompt_preset',
    function () {
        const type =
            String(
                $('#tutu_aux_prompt_type').val() ||
                'jailbreak'
            );

        const id =
            String($(this).val() || '');

        loadTutuAuxPromptIntoEditor(
            type,
            id
        );

        /*
         * 选中了已有条目时自动展开编辑器。
         */
        if (id) {
            const details =
                document.getElementById(
                    'tutu_aux_prompt_editor_details'
                );

            if (details) {
                details.open = true;
            }
        }

        updateTutuAuxPromptEditorStatus();
    }
);


$(document).on(
    'click',
    '#tutu_new_aux_prompt_btn',
    function () {
        clearTutuAuxPromptEditor();

        $('#tutu_aux_prompt_name')
            .trigger('focus');
    }
);

$(document).on(
    'click',
    '#tutu_save_aux_prompt_btn',
    function () {
        try {
            const type =
                String(
                    $('#tutu_aux_prompt_type').val() ||
                    'jailbreak'
                );

            const oldId =
                String(
                    $('#tutu_aux_prompt_preset').val() ||
                    ''
                );

            const record =
                saveTutuAuxPromptRecord(
                    type,
                    $('#tutu_aux_prompt_name').val(),
                    $('#tutu_aux_prompt_content').val(),
                    oldId
                );

renderTutuAuxPromptManager();

$('#tutu_aux_prompt_type')
    .val(type);

renderTutuAuxPromptPresetSelect();

$('#tutu_aux_prompt_preset')
    .val(record.id);

loadTutuAuxPromptIntoEditor(
    type,
    record.id
);

updateTutuAuxPromptEditorStatus();

            toastr.success(
                `${getTutuAuxPromptTypeLabel(type)}提示词「${record.name}」已保存`
            );
        } catch (error) {
            toastr.warning(
                error.message ||
                '保存提示词失败'
            );
        }
    }
);

$(document).on(
    'click',
    '#tutu_delete_aux_prompt_btn',
    function () {
        const type =
            String(
                $('#tutu_aux_prompt_type').val() ||
                'jailbreak'
            );

        const id =
            String(
                $('#tutu_aux_prompt_preset').val() ||
                ''
            );

        if (!id) {
            toastr.warning('请先选择要删除的提示词');
            return;
        }

        const record =
            findTutuAuxPrompt(type, id);

        if (!record) {
            toastr.error('找不到这个提示词');
            return;
        }

        if (
            !confirm(
                `确定删除「${record.name}」吗？`
            )
        ) {
            return;
        }

        deleteTutuAuxPromptRecord(
            type,
            id
        );

        setTutuActiveAuxIds(
            type,
            getTutuActiveAuxIds(type).filter(item => item !== id)
        );

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        clearTutuAuxPromptEditor();
        renderTutuAuxPromptManager();

        toastr.success('提示词已删除');
    }
);

$(document).on(
    'change',
    '.tutu-aux-active-checkbox',
    function () {
        const type = String($(this).attr('data-type') || '');

        if (!AUX_PROMPT_TYPES.includes(type)) return;

        const id = String($(this).val() || '');
        const ids = getTutuActiveAuxIds(type).filter(item => item !== id);

        // 新勾选的追加到末尾，保持勾选顺序
        if ($(this).is(':checked')) ids.push(id);

        setTutuActiveAuxIds(type, ids);

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        updateTutuAuxActiveCount(type);
    }
);
    $(document).on('click', '#tutu_export_styles_btn', exportTutuStyles);

$(document).on('click', '#tutu_import_styles_btn', function () {
    $('#tutu_import_styles_file').val('').trigger('click');
});

$(document).on('change', '#tutu_import_styles_file', async function () {
    try {
        await importTutuStyles(this.files?.[0]);
        toastr.success('样式导入成功');
    } catch (error) {
        toastr.error(error.message || '样式导入失败');
    }
});
    $(document).on('change', '#tutu_quote_style_preset', function () {
    const id = $(this).val();
    const preset = tutuStyleLibrary.quote
        .find(item => item.id === id);

    $('#tutu_quote_style_name').val(preset?.name || '');
    $('#tutu_qe_custom_css').val(preset?.css || '');

    tutuSettings.stylePresetIds.quote = id;
    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(tutuSettings)
    );
});



    $(document).on(
    'change',
    '#tutu_ui_theme',
    function () {
        saveAndApplyTutuUiTheme(
            $(this).val()
        );
    }
);

$(document).on(
    'click',
    '.tutu-theme-preview',
    function () {
        const theme =
            String(
                $(this).attr('data-theme') ||
                'classic'
            );

        $('#tutu_ui_theme').val(theme);

        saveAndApplyTutuUiTheme(theme);
    }
);

$(document).on(
    'click',
    '#tutu_apply_custom_css_btn',
    function () {
        $('#tutu_ui_theme').val('custom');

        saveAndApplyTutuUiTheme('custom');

        toastr.success(
            '自定义界面 CSS 已应用'
        );
    }
);
/*
 * 保存或更新管理器自定义样式
 */
$(document).on(
    'click',
    '#tutu_save_manager_style_btn',
    function () {
        try {
            const record = saveTutuStylePreset(
                'manager',
                $('#tutu_manager_style_name').val(),
                $('#tutu_ui_custom_css').val(),
                $('#tutu_manager_style_preset').val()
            );

            tutuSettings.stylePresetIds.manager = record.id;
            tutuSettings.uiTheme = 'custom';
            tutuSettings.uiCustomCss = record.css;

            localStorage.setItem(
                SETTINGS_KEY,
                JSON.stringify(tutuSettings)
            );

            $('#tutu_ui_theme').val('custom');

            renderTutuStylePresetSelects();

            $('#tutu_manager_style_name').val(record.name);


            toastr.success(
                `管理器样式「${record.name}」已保存`
            );
        } catch (error) {
            toastr.warning(
                error.message || '保存管理器样式失败'
            );
        }
    }
);

/*
 * 删除当前选中的管理器样式
 */
$(document).on(
    'click',
    '#tutu_delete_manager_style_btn',
    function () {
        const id = String(
            $('#tutu_manager_style_preset').val() || ''
        );

        if (!id) {
            toastr.warning('请先选择要删除的管理器样式');
            return;
        }

        const preset = tutuStyleLibrary.manager.find(
            item => item.id === id
        );

        if (!preset) {
            toastr.error('找不到要删除的管理器样式');
            return;
        }

        if (
            !confirm(
                `确定删除管理器样式「${preset.name}」吗？`
            )
        ) {
            return;
        }

        deleteTutuStylePreset('manager', id);

        if (
            tutuSettings.stylePresetIds.manager === id
        ) {
            tutuSettings.stylePresetIds.manager = '';
            tutuSettings.uiCustomCss = '';
            tutuSettings.uiTheme = 'classic';
        }

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        $('#tutu_manager_style_name').val('');
        $('#tutu_ui_custom_css').val('');
        $('#tutu_ui_theme').val('classic');

        renderTutuStylePresetSelects();
        applyTutuUiTheme('classic', '');

        toastr.success(
            `管理器样式「${preset.name}」已删除`
        );
    }
);

/*
 * 选择已保存的管理器样式
 */
$(document).on(
    'change',
    '#tutu_manager_style_preset',
    function () {
        const id = String($(this).val() || '');

        const preset = tutuStyleLibrary.manager.find(
            item => item.id === id
        );

        $('#tutu_manager_style_name').val(
            preset?.name || ''
        );

        $('#tutu_ui_custom_css').val(
            preset?.css || ''
        );

        tutuSettings.stylePresetIds.manager = id;

        if (preset) {
            tutuSettings.uiTheme = 'custom';
            tutuSettings.uiCustomCss = preset.css;

            $('#tutu_ui_theme').val('custom');

            applyTutuUiTheme(
                'custom',
                preset.css
            );
        }

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );
    }
);





$(document).on(
    'click',
    '#tutu_reset_custom_css_btn',
    function () {
        $('#tutu_ui_custom_css').val('');

        tutuSettings.uiCustomCss = '';

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        installTutuCustomCss('');

        toastr.success(
            '自定义 CSS 已清空'
        );
    }
);

/*
 * 编辑 CSS 时实时预览，避免每次都点应用。
 */
let tutuCustomCssPreviewTimer = null;

$(document).on(
    'input',
    '#tutu_ui_custom_css',
    function () {
        if (
            $('#tutu_ui_theme').val() !==
            'custom'
        ) {
            return;
        }

        clearTimeout(
            tutuCustomCssPreviewTimer
        );

        tutuCustomCssPreviewTimer =
            setTimeout(() => {
                const css =
                    String(
                        $('#tutu_ui_custom_css')
                            .val() || ''
                    );

                installTutuCustomCss(css);

                tutuSettings.uiCustomCss = css;

                localStorage.setItem(
                    SETTINGS_KEY,
                    JSON.stringify(tutuSettings)
                );
            }, 250);
    }
);
    $(document).on(
    'input',
    '#tutu_capture_tag_name',
    function () {
        tutuSettings.captureTagName =
            $(this).val().trim();

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );
    }
);
    // 打开小剧场导入导出面板
$(document).on(
    'click',
    '#tutu_toggle_transfer_btn',
    function () {
        const $panel =
            $('#tutu_transfer_panel');

        if ($panel.is(':visible')) {
            $panel.stop(true, true).slideUp(160);
        } else {
            renderTutuExportCategorySelect();

            $panel.stop(true, true).slideDown(160);
        }
    }
);


// 关闭小剧场导入导出面板
$(document).on(
    'click',
    '#tutu_close_transfer_btn',
    function () {
        $('#tutu_transfer_panel')
            .stop(true, true)
            .slideUp(160);
    }
);
$(document).on(
    'change',
    '#tutu_export_scope',
    function () {
        const scope =
            String($(this).val() || 'all');

        if (scope === 'category') {
            renderTutuExportCategorySelect();

            $('#tutu_export_category_row')
                .stop(true, true)
                .slideDown(160);
        } else {
            $('#tutu_export_category_row')
                .stop(true, true)
                .slideUp(160);
        }
    }
);
// 导出小剧场
$(document).on(
    'click',
    '#tutu_export_library_btn',
    function () {
        const exportType =
            String(
                $('#tutu_export_type').val() ||
                'tutu_json'
            );

        if (exportType === 'st_preset') {
            exportTutuSillyTavernPreset();
            return;
        }

        if (exportType === 'st_worldbook') {
            exportTutuSillyTavernWorldbook();
            return;
        }

        exportTutuJsonPackage();
    }
);


// 点击导入按钮，打开文件选择器
$(document).on(
    'click',
    '#tutu_import_library_btn',
    function () {
        $('#tutu_import_library_file')
            .val('')
            .trigger('click');
    }
);


// 选择克制 JSON 文件
$(document).on(
    'change',
    '#tutu_import_library_file',
    async function () {
        const file =
            this.files?.[0];

        if (!file) {
            return;
        }

        try {
            await importTutuLibraryFile(file);
        } catch (error) {
            console.error(
                '导入克制放映室失败：',
                error
            );

            toastr.error(
                error.message || '导入失败'
            );
        } finally {
            $(this).val('');
        }
    }
);

 
    $(document).on(
    'click',
    '.tutu-favorite-html-preview-btn',
    function (event) {
        event.stopPropagation();

        const $button = $(this);

        const $card =
            $button.closest('.tutu-favorite-card');

        const $container =
            $card.find(
                '.tutu-favorite-html-container'
            );

        const isVisible =
            $container.is(':visible');

        if (isVisible) {
            $container.stop(true, true).slideUp(180);

            $button.html(`
                <i class="fa-solid fa-display"></i>
                预览 HTML 小剧场
            `);
        } else {
            $container.stop(true, true).slideDown(180);

            $button.html(`
                <i class="fa-solid fa-eye-slash"></i>
                收起 HTML 预览
            `);
        }
    }
);

    $(document).on(
    'click',
    '#tutu_favorite_current_btn',
    function () {
        favoriteCurrentTutuTheater();
    }
);

$(document).on(
    'click',
    '#tutu_export_current_btn',
    function () {
        exportCurrentTutuTheater();
    }
);
$(document).on(
    'click',
    '#tutu_fullscreen_current_btn',
    function () {
        const content =
            String(tutuCurrentResultContent || '').trim();

        if (!content) {
            toastr.warning('当前没有可以查看的小剧场');
            return;
        }

        openTutuTheaterFullscreen(
            content,
            tutuCurrentResultCharacter || 'AI'
        );
    }
);

$(document).on(
    'click',
    '#tutu_clear_favorites_btn',
    function () {
        clearTutuFavorites();
    }
);

$(document).on(
    'click',
    '.tutu-favorite-delete-btn',
    function (event) {
        event.stopPropagation();

        const id = String(
            $(this)
                .closest('.tutu-favorite-card')
                .data('id')
        );

        removeTutuFavorite(id);

        toastr.success('收藏已删除');
    }
);

$(document).on(
    'click',
    '.tutu-favorite-group-header',
    function () {
        const $group =
            $(this).closest(
                '.tutu-favorite-group'
            );

        const $groupList =
            $group.find(
                '.tutu-favorite-group-list'
            );

        const $arrow =
            $group.find(
                '.tutu-favorite-group-arrow'
            );

        const characterName =
            String(
                $group
                    .find(
                        '.tutu-favorite-character-name'
                    )
                    .text() || ''
            ).trim();

        const expandedGroups =
            loadTutuFavoriteExpandedGroups();

        const isVisible =
            $groupList.is(':visible');

        if (isVisible) {
            $groupList.stop(true, true).slideUp(160);

            $arrow
                .removeClass('fa-chevron-up')
                .addClass('fa-chevron-down');

            expandedGroups.delete(characterName);
        } else {
            $groupList.stop(true, true).slideDown(160);

            $arrow
                .removeClass('fa-chevron-down')
                .addClass('fa-chevron-up');

            expandedGroups.add(characterName);
        }

        saveTutuFavoriteExpandedGroups(
            expandedGroups
        );
    }
);
$(document).on(
    'click',
    '.tutu-favorite-edit-btn',
    function (event) {
        /*
         * 防止点击编辑按钮时触发角色分组折叠
         */
        event.stopPropagation();

        const id =
            String(
                $(this)
                    .closest('.tutu-favorite-card')
                    .data('id')
            );

        renameTutuFavorite(id);
    }
);

$(document).on(
    'click',
    '.tutu-favorite-export-btn',
    function (event) {
        event.stopPropagation();

        const id = String(
            $(this)
                .closest('.tutu-favorite-card')
                .data('id')
        );

        const favorite =
            loadTutuFavorites()
                .find(item => item.id === id);

        if (!favorite) {
            toastr.error('找不到这条收藏');
            return;
        }

        const characterName =
            favorite.characterName || 'AI';

        if (favorite.type === 'html') {
            exportTutuHtmlFile(
                favorite.content,
                characterName
            );
        } else {
            const exportFormat =
                $('#tutu_export_format').val() ||
                'text';

            if (exportFormat === 'text') {
                exportTutuTextFile(
                    favorite.content,
                    characterName
                );
            } else {
                const styleName =
                    $('#tutu_export_style').val() ||
                    'classic';

                exportTutuQuoteImage(
                    favorite.content,
                    characterName,
                    styleName
                );
            }
        }
    }
);
$(document).on(
    'click',
    '.tutu-favorite-fullscreen-btn',
    function (event) {
        event.stopPropagation();

        const id = String(
            $(this)
                .closest('.tutu-favorite-card')
                .data('id')
        );

        const favorite =
            loadTutuFavorites()
                .find(item => String(item.id) === id);

        if (!favorite) {
            toastr.error('找不到这条收藏');
            return;
        }

        const content =
            String(favorite.content || '').trim();

        if (!content) {
            toastr.warning('这条收藏没有内容');
            return;
        }

        const characterName =
            String(
                favorite.characterName || 'AI'
            ).trim() || 'AI';

        openTutuTheaterFullscreen(
            content,
            characterName
        );
    }
);

$(document).on(
    'change',
    '#tutu_output_mode, #tutu_embed_default_state, #tutu_capture_tag_name',
    function () {
        tutuSettings.outputMode =
            $('#tutu_output_mode').val() || 'panel';

        tutuSettings.embedDefaultCollapsed =
            $('#tutu_embed_default_state').val() === 'collapsed';
tutuSettings.captureTagName =
    $('#tutu_capture_tag_name').val().trim();

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );
    }
);


$(document).on(
    'click',
    '#tutu_add_category_btn',
    function () {
        const $input = $('#tutu_new_category_input');

        const category =
            String($input.val() || '').trim();

        if (!category) {
            toastr.warning('请输入分类名称');
            return;
        }

        if (tutuCategories.includes(category)) {
            toastr.warning('这个分类已经存在');
            return;
        }

        tutuCategories.push(category);
        saveTutuCategories();

        $input.val('');

        renderLibrary();

        toastr.success(`分类「${category}」已创建`);
    }
);
$(document).on(
    'click',
    '.tutu-category-header',
    function () {
        if (tutuSuppressNextHeaderClick) {
            tutuSuppressNextHeaderClick = false;
            return;
        }

        const $section =
            $(this).closest('.tutu-category-section');

        const category = String(
            $section.attr('data-category') || ''
        ).trim();

        if ($section.hasClass('expanded')) {
            tutuExpandedCategories.delete(category);
            $section.removeClass('expanded');
        } else {
            tutuExpandedCategories.add(category);
            $section.addClass('expanded');
        }

        saveTutuExpandedCategories();
    }
);


let tutuDraggingScenarioIndex = -1;
function moveTutuScenarioToCategory(index, newCategory) {
    index = Number(index);
    newCategory = String(newCategory || '').trim();

    if (
        !Number.isInteger(index) ||
        index < 0 ||
        !tutuScenarios[index] ||
        !newCategory
    ) {
        return false;
    }

    const scenario = tutuScenarios[index];
        const oldCategory =
        String(scenario.category || '未分类').trim() ||
        '未分类';

    if (oldCategory === newCategory) {
        return false;
    }


    scenario.category = newCategory;

    if (!tutuCategories.includes(newCategory)) {
        tutuCategories.push(newCategory);
    }

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );

    saveTutuCategories();

    // 先展开目标分类，再渲染，这样能立刻看到移动结果
    tutuExpandedCategories.add(newCategory);
    tutuExpandedCategories.add(oldCategory);
    saveTutuExpandedCategories();

    renderLibrary();
    renderTutuCategorySelects();


    toastr.success(
        `已将「${scenario.name}」移动到「${newCategory}」`
    );

    return true;
}





function clearTutuDragOverState() {
    $('.tutu-category-drop-target')
        .removeClass('drag-over');
}



// ==========================================
// 移动端触摸拖动剧本
// ==========================================

let tutuTouchDragState = null;



function getTutuDropzoneFromTouch(touch) {
    const element = document.elementFromPoint(
        touch.clientX,
        touch.clientY
    );

    if (!element) {
        return null;
    }

    // 展开的分类落在 dropzone 上，折叠的分类落在标题上
    const target = element.closest(
        '.tutu-category-drop-target'
    );

    return target ? $(target) : null;
}


let tutuSuppressNextHeaderClick = false;

function clearTutuTouchDragState() {
    const state = tutuTouchDragState;

    if (!state) {
        return;
    }

    if (state.$card) {
        state.$card.removeClass('tutu-touch-dragging');
    }

    if (state.$ghost) {
        state.$ghost.remove();
    }

    $('.tutu-category-drop-target')
        .removeClass('tutu-touch-drag-over');

    tutuTouchDragState = null;
}

function getTutuDropTargetFromPoint(x, y) {
    const element = document.elementFromPoint(x, y);

    if (!element) {
        return null;
    }

    const target = element.closest('.tutu-category-drop-target');

    return target ? $(target) : null;
}

$(document).on(
    'pointerdown',
    '.tutu-script-card',
    function (event) {
        if (tutuBatchManageEnabled) {
            return;
        }

        const e = event.originalEvent;

        // 鼠标只响应左键
        if (!e || (e.pointerType === 'mouse' && e.button !== 0)) {
            return;
        }

        // 点在操作按钮或输入控件上不启动拖动
        if (
            $(event.target).closest(
                '.tutu-script-actions, button, input, textarea, select'
            ).length
        ) {
            return;
        }

        const index = Number($(this).attr('data-index'));

        if (!Number.isInteger(index) || !tutuScenarios[index]) {
            return;
        }

        tutuTouchDragState = {
            index,
            pointerId: e.pointerId,
            $card: $(this),
            startX: e.clientX,
            startY: e.clientY,
            dragging: false,
            $ghost: null,
        };
    }
);

$(document).on(
    'pointermove',
    function (event) {
        const state = tutuTouchDragState;

        if (!state) {
            return;
        }

        const e = event.originalEvent;

        if (!e || e.pointerId !== state.pointerId) {
            return;
        }

        const distance = Math.hypot(
            e.clientX - state.startX,
            e.clientY - state.startY
        );

        // 超过 8px 才认为是拖动，避免影响普通点击
        if (!state.dragging && distance < 8) {
            return;
        }

        if (!state.dragging) {
            state.dragging = true;

            state.$card.addClass('tutu-touch-dragging');

            state.$ghost = $('<div class="tutu-touch-drag-ghost"></div>');

            state.$ghost.text(
                tutuScenarios[state.index]?.name || '移动中的剧本'
            );

            $('body').append(state.$ghost);
        }

        if (event.cancelable) {
            event.preventDefault();
        }

        state.$ghost.css({
            left: `${e.clientX + 12}px`,
            top: `${e.clientY + 12}px`,
        });

        const $target = getTutuDropTargetFromPoint(e.clientX, e.clientY);

        $('.tutu-category-drop-target')
            .removeClass('tutu-touch-drag-over');

        if ($target && $target.length) {
            $target.addClass('tutu-touch-drag-over');
        }
    }
);

$(document).on(
    'pointerup pointercancel',
    function (event) {
        const state = tutuTouchDragState;

        if (!state) {
            return;
        }

        const e = event.originalEvent;

        if (!e || e.pointerId !== state.pointerId) {
            return;
        }

        if (state.dragging && event.type === 'pointerup') {
            const $target = getTutuDropTargetFromPoint(e.clientX, e.clientY);

            if ($target && $target.length) {
                const newCategory = String(
                    $target.attr('data-category') || ''
                ).trim();

                moveTutuScenarioToCategory(state.index, newCategory);
            }

            // 落在分类标题上时，抑制紧随其后的 click
            tutuSuppressNextHeaderClick = true;
        }

        clearTutuTouchDragState();
    }
);


// 自动生成范围切换
$(document).on(
    'change',
    '#tutu_auto_generate_scope',
    function () {
        tutuSettings.autoGenerateScope =
            $(this).val() || 'all';

        if (
            tutuSettings.autoGenerateScope !== 'category'
        ) {
            tutuSettings.autoGenerateCategory = '';
        }

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        updateAutoCategoryVisibility();
    }
);

// 自动生成分类切换
$(document).on(
    'change',
    '#tutu_auto_generate_category',
    function () {
        tutuSettings.autoGenerateCategory =
            $(this).val() || '';

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );
    }
);

// 点击随机剧本：按当前自动生成范围随机选择并立即生成
$(document).on(
    'click',
    '#tutu_random_script_btn',
    function () {
        const scenario =
            getRandomTutuScenario();

        if (!scenario) {
            toastr.warning(
                '当前范围内没有可用剧本'
            );

            return;
        }

        $('#tutu_prompt').val(
            scenario.prompt || ''
        );

        runTutuGeneration({
            scenario: scenario.prompt || '',
            isAutomatic: false,
            scenarioId: scenario.id || '',
        });
    }
);

$(document).on(
    'click',
    '#tutu_context_toggle_btn',
    function () {
        const $box =
            $('#tutu_character_context_box');

        if ($box.is(':visible')) {
            $box.stop(true, true).slideUp(180);
        } else {
            $box.stop(true, true).slideDown(180);
        }
    }
);

$(document).on(
    'click',
    '#tutu_clear_prompt_btn',
    function () {
        $('#tutu_prompt')
            .val('')
            .trigger('focus');
    }
);

    $(document).on(
    'click',
    '#tutu_worldbook_toggle',
    function () {
        const $toggle = $(this);
        const $content = $('#tutu_worldbook_content');

        const isExpanded = $toggle.hasClass('expanded');

        if (isExpanded) {
            $content.stop(true, true).slideUp(180);
            $toggle.removeClass('expanded');
        } else {
            $content.stop(true, true).slideDown(180);
            $toggle.addClass('expanded');
        }
    }
);
    $(document).on(
    'change',
    '.tutu-character-world-entry-checkbox',
    function () {
        saveTutuWorldEntrySelection();
    }
);
$(document).on(
    'change',
    '#tutu_include_history',
    function () {
        const includeHistory = $(this).is(':checked');

        if (includeHistory) {
            $('#tutu_history_limit_box').show();
        } else {
            $('#tutu_history_limit_box').hide();
        }

        saveCurrentTutuCharacterStorage({
            selectedWorldEntries:
                tutuCurrentCharacterContext.selectedWorldEntries || [],

            includeHistory,

            historyLimit:
                Number($('#tutu_history_limit').val()) || 20,
        });

        tutuCurrentCharacterContext.includeHistory = includeHistory;
    }
);
$(document).on(
    'change',
    '#tutu_history_limit',
    function () {
        saveCurrentTutuCharacterStorage({
            selectedWorldEntries:
                tutuCurrentCharacterContext.selectedWorldEntries || [],

            includeHistory:
                $('#tutu_include_history').is(':checked'),

            historyLimit:
                Number($(this).val()) || 20,
        });

        tutuCurrentCharacterContext.historyLimit =
            Number($(this).val()) || 20;
    }
);

// 历史聊天记录：只读标签 / 排除标签 / 自动排除注释（全局，输入即自动保存）
$(document).on(
    'input change',
    '#tutu_history_include_tags, #tutu_history_exclude_tags, #tutu_history_exclude_comments',
    function () {
        tutuSettings.historyIncludeTags =
            String($('#tutu_history_include_tags').val() || '').trim();

        tutuSettings.historyExcludeTags =
            String($('#tutu_history_exclude_tags').val() || '').trim();

        tutuSettings.historyExcludeComments =
            $('#tutu_history_exclude_comments').is(':checked');

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );
    }
);


// ==========================================
// 渲染管理：正则 / CSS
// ==========================================
$(document).on(
    'change',
    '#tutu_render_regex_enabled, #tutu_render_css_enabled',
    function () {
        tutuSettings.renderRegexEnabled =
            $('#tutu_render_regex_enabled').is(':checked');

        tutuSettings.renderCssEnabled =
            $('#tutu_render_css_enabled').is(':checked');

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        refreshTutuCurrentRender();
    }
);

// 内置防截断
$(document).on('change', '#tutu_render_anti_clip', function () {
    tutuSettings.renderAntiClip = $(this).is(':checked');
    persistTutuSettings();
    refreshTutuCurrentRender();
});

// ==========================================
// 排版美化
// ==========================================
const TUTU_HEX_COLOR = /^#[0-9a-f]{6}$/i;

function loadTutuTypographyToUI() {
    const typo = getTutuTypographyState();

    $('#tutu_typo_enabled').prop('checked', Boolean(typo.enabled));
    $('#tutu_typo_font_size').val(typo.fontSize);
    $('#tutu_typo_line_height').val(typo.lineHeight);
    $('#tutu_typo_padding').val(typo.padding);
    $('#tutu_typo_font_preset').val(
        TUTU_FONT_PRESETS[typo.fontPreset] !== undefined || typo.fontPreset === 'custom'
            ? typo.fontPreset
            : 'inherit'
    );
    $('#tutu_typo_font_family').val(typo.fontFamily || '');
    $('#tutu_typo_font_url').val(typo.fontUrl || '');
    $('#tutu_typo_text_color').val(typo.textColor || '');
    $('#tutu_typo_bg_color').val(typo.bgColor || '');
    $('#tutu_typo_bg_image').val(typo.bgImage || '');
    $('#tutu_typo_padding_x').val(typo.paddingX);
    $('#tutu_typo_letter_spacing').val(typo.letterSpacing);
    $('#tutu_typo_paragraph_spacing').val(typo.paragraphSpacing);
    $('#tutu_typo_text_indent').val(typo.textIndent);
    $('#tutu_typo_max_width').val(typo.maxWidth);
    $('#tutu_typo_quote_color').val(typo.quoteColor || '');
    $('#tutu_typo_quote_highlight').prop('checked', Boolean(typo.quoteHighlight));
    $('#tutu_typo_drop_cap').prop('checked', Boolean(typo.dropCap));
    $('#tutu_typo_chat_bubble').prop('checked', Boolean(typo.chatBubble));
    $('#tutu_typo_dialogue_block').prop('checked', Boolean(typo.dialogueBlock));

    if (TUTU_HEX_COLOR.test(typo.quoteColor || '')) {
        $('#tutu_typo_quote_color_picker').val(typo.quoteColor);
    }

    renderTutuTypographyPresetOptions();

    if (TUTU_HEX_COLOR.test(typo.textColor || '')) {
        $('#tutu_typo_text_color_picker').val(typo.textColor);
    }

    if (TUTU_HEX_COLOR.test(typo.bgColor || '')) {
        $('#tutu_typo_bg_color_picker').val(typo.bgColor);
    }
}

function readTutuTypographyNumber(selector, fallback) {
    const raw = String($(selector).val() ?? '').trim();
    const value = Number(raw);

    // 输入框清空或输入中途时保留原值
    return raw && Number.isFinite(value) ? value : fallback;
}

let tutuTypographyRefreshTimer = null;

function saveTutuTypographyFromUI() {
    const old = getTutuTypographyState();

    tutuSettings.typography = {
        ...old,
        enabled: $('#tutu_typo_enabled').is(':checked'),
        fontSize: readTutuTypographyNumber('#tutu_typo_font_size', old.fontSize),
        lineHeight: readTutuTypographyNumber('#tutu_typo_line_height', old.lineHeight),
        padding: readTutuTypographyNumber('#tutu_typo_padding', old.padding),
        fontPreset: $('#tutu_typo_font_preset').val() || 'inherit',
        fontFamily: String($('#tutu_typo_font_family').val() || '').trim(),
        fontUrl: String($('#tutu_typo_font_url').val() || '').trim(),
        textColor: String($('#tutu_typo_text_color').val() || '').trim(),
        bgColor: String($('#tutu_typo_bg_color').val() || '').trim(),
        bgImage: String($('#tutu_typo_bg_image').val() || '').trim(),
        paddingX: readTutuTypographyNumber('#tutu_typo_padding_x', old.paddingX),
        letterSpacing: readTutuTypographyNumber('#tutu_typo_letter_spacing', old.letterSpacing),
        paragraphSpacing: readTutuTypographyNumber('#tutu_typo_paragraph_spacing', old.paragraphSpacing),
        textIndent: readTutuTypographyNumber('#tutu_typo_text_indent', old.textIndent),
        maxWidth: readTutuTypographyNumber('#tutu_typo_max_width', old.maxWidth),
        quoteColor: String($('#tutu_typo_quote_color').val() || '').trim(),
        quoteHighlight: $('#tutu_typo_quote_highlight').is(':checked'),
        dropCap: $('#tutu_typo_drop_cap').is(':checked'),
        chatBubble: $('#tutu_typo_chat_bubble').is(':checked'),
        dialogueBlock: $('#tutu_typo_dialogue_block').is(':checked'),
    };

    persistTutuSettings();
    loadTutuOutputFormatToUI();

    // 页面内纯文本立即生效
    applyTutuTypographyStyle();

    // iframe 内的内容需要重新渲染，防抖避免输入时频繁刷新
    clearTimeout(tutuTypographyRefreshTimer);
    tutuTypographyRefreshTimer = setTimeout(refreshTutuCurrentRender, 400);
}

$(document).on(
    'input change',
    '#tutu_typo_enabled, #tutu_typo_font_size, #tutu_typo_line_height, #tutu_typo_padding, #tutu_typo_font_preset, #tutu_typo_font_family, #tutu_typo_font_url, #tutu_typo_text_color, #tutu_typo_bg_color, #tutu_typo_bg_image, '
        + '#tutu_typo_padding_x, #tutu_typo_letter_spacing, #tutu_typo_paragraph_spacing, #tutu_typo_text_indent, #tutu_typo_max_width, #tutu_typo_quote_color, '
        + '#tutu_typo_quote_highlight, #tutu_typo_drop_cap, #tutu_typo_chat_bubble, #tutu_typo_dialogue_block',
    saveTutuTypographyFromUI
);

$(document).on('input change', '#tutu_typo_quote_color_picker', function () {
    $('#tutu_typo_quote_color').val($(this).val());
    saveTutuTypographyFromUI();
});

// ---------- 排版预设 ----------
function getTutuTypographyPresets() {
    if (!Array.isArray(tutuSettings.typographyPresets)) {
        tutuSettings.typographyPresets = [];
    }

    return tutuSettings.typographyPresets;
}

function renderTutuTypographyPresetOptions(selectedName = '') {
    const $select = $('#tutu_typo_preset_select');

    if (!$select.length) return;

    $select.empty().append('<option value="">选择预设套用……</option>');

    getTutuTypographyPresets().forEach(preset => {
        $('<option>')
            .val(preset.name)
            .text(preset.name)
            .appendTo($select);
    });

    $select.val(selectedName);
}

// ---------- 生成格式：纯文本 / HTML ----------
function loadTutuOutputFormatToUI() {
    const format = getTutuOutputFormat();

    $('.tutu-format-btn').each(function () {
        const active = $(this).attr('data-format') === format;

        $(this)
            .toggleClass('active', active)
            .attr('aria-checked', active ? 'true' : 'false');
    });

    $('#tutu_format_hint').text(
        format === 'html'
            ? '交互网页 · 手机 / 电脑双端适配'
            : (getTutuTypographyState().enabled ? '自动套用排版美化' : '排版美化未启用')
    );

    $('#tutu_html_prompt').val(String(tutuSettings.htmlPromptCustom || ''));
}

$(document).on('click', '.tutu-format-btn', function () {
    const format = $(this).attr('data-format') === 'html' ? 'html' : 'text';

    if (tutuSettings.outputFormat === format) return;

    tutuSettings.outputFormat = format;
    persistTutuSettings();
    loadTutuOutputFormatToUI();
});

$(document).on('input change', '#tutu_html_prompt', function () {
    const value = String($(this).val() || '');

    // 和内置版本一字不差时按留空保存，以后内置版本升级能自动跟上
    tutuSettings.htmlPromptCustom = value.trim() === TUTU_DEFAULT_HTML_PROMPT.trim() ? '' : value;
    persistTutuSettings();
});

$(document).on('click', '#tutu_html_prompt_view_btn', function () {
    const current = String($('#tutu_html_prompt').val() || '').trim();

    if (current && !window.confirm('用内置版本覆盖输入框里的内容？')) return;

    $('#tutu_html_prompt').val(TUTU_DEFAULT_HTML_PROMPT);
    tutuSettings.htmlPromptCustom = '';
    persistTutuSettings();
});

$(document).on('click', '#tutu_html_prompt_reset_btn', function () {
    $('#tutu_html_prompt').val('');
    tutuSettings.htmlPromptCustom = '';
    persistTutuSettings();
    toastr.success('已恢复内置 HTML 生成要求');
});

function applyTutuTypographyAll() {
    persistTutuSettings();
    loadTutuTypographyToUI();
    applyTutuTypographyStyle();
    refreshTutuCurrentRender();
}

$(document).on('change', '#tutu_typo_preset_select', function () {
    const name = String($(this).val() || '');
    const preset = getTutuTypographyPresets().find(item => item.name === name);

    if (!preset) return;

    tutuSettings.typography = {
        ...getDefaultTutuTypography(),
        ...preset.typography,
    };

    applyTutuTypographyAll();
    renderTutuTypographyPresetOptions(name);
    toastr.success(`已套用排版预设「${name}」`);
});

$(document).on('click', '#tutu_typo_preset_save_btn', function () {
    const current = String($('#tutu_typo_preset_select').val() || '');
    const input = window.prompt('排版预设名称：', current || '我的排版');

    if (input === null) return;

    const name = input.trim().slice(0, 40);

    if (!name) {
        toastr.warning('预设名称不能为空');
        return;
    }

    const presets = getTutuTypographyPresets();
    const existing = presets.find(item => item.name === name);

    if (existing && !window.confirm(`预设「${name}」已存在，要覆盖吗？`)) {
        return;
    }

    const snapshot = JSON.parse(JSON.stringify(getTutuTypographyState()));

    if (existing) {
        existing.typography = snapshot;
    } else {
        presets.push({ name, typography: snapshot });
    }

    persistTutuSettings();
    renderTutuTypographyPresetOptions(name);
    toastr.success(`已保存排版预设「${name}」`);
});

$(document).on('click', '#tutu_typo_preset_delete_btn', function () {
    const name = String($('#tutu_typo_preset_select').val() || '');

    if (!name) {
        toastr.info('请先在下拉框选择要删除的预设');
        return;
    }

    if (!window.confirm(`删除排版预设「${name}」？`)) return;

    tutuSettings.typographyPresets = getTutuTypographyPresets()
        .filter(item => item.name !== name);

    persistTutuSettings();
    renderTutuTypographyPresetOptions();
    toastr.success('预设已删除');
});

// 取色器与文本框同步
$(document).on('input change', '#tutu_typo_text_color_picker', function () {
    $('#tutu_typo_text_color').val($(this).val());
    saveTutuTypographyFromUI();
});

$(document).on('input change', '#tutu_typo_bg_color_picker', function () {
    $('#tutu_typo_bg_color').val($(this).val());
    saveTutuTypographyFromUI();
});

$(document).on('click', '#tutu_typo_reset_btn', function () {
    tutuSettings.typography = getDefaultTutuTypography();
    persistTutuSettings();
    loadTutuTypographyToUI();
    applyTutuTypographyStyle();
    refreshTutuCurrentRender();
    toastr.success('排版已恢复默认');
});

$(document).on('change', '.tutu-render-toggle', function () {
    const $row = $(this).closest('.tutu-render-item');
    const kind = String($row.attr('data-kind'));
    const id = String($row.attr('data-id'));
    const list = tutuRenderLibrary[kind] || [];
    const item = list.find(entry => entry.id === id);

    if (!item) return;

    item.enabled = $(this).is(':checked');
    saveTutuRenderLibrary();
    refreshTutuCurrentRender();
});

$(document).on('click', '.tutu-render-delete', function () {
    const $row = $(this).closest('.tutu-render-item');
    const kind = String($row.attr('data-kind'));
    const id = String($row.attr('data-id'));
    const list = tutuRenderLibrary[kind] || [];
    const item = list.find(entry => entry.id === id);

    if (!item) return;

    const label = kind === 'regex' ? item.scriptName : item.name;
    const tip = kind === 'groups'
        ? `确定删除分组「${label}」吗？组内正则会移到“未分组”。`
        : `确定删除「${label}」吗？`;

    if (!confirm(tip)) return;

    tutuRenderLibrary[kind] = list.filter(entry => entry.id !== id);

    if (kind === 'groups') {
        tutuRenderLibrary.regex.forEach(entry => {
            if (entry.groupId === id) entry.groupId = '';
        });
    }

    if ($('#tutu_render_bind_panel').attr('data-id') === id) {
        $('#tutu_render_bind_panel').hide();
    }

    saveTutuRenderLibrary();
    renderTutuRenderManager();
    refreshTutuCurrentRender();
});

// 新建正则分组
$(document).on('click', '#tutu_render_group_add_btn', function () {
    const name =
        String($('#tutu_render_group_name').val() || '').trim() ||
        `分组 ${tutuRenderLibrary.groups.length + 1}`;

    tutuRenderLibrary.groups.push({
        id: createTutuRenderId('grp'),
        name,
        enabled: true,
        bindScenarioIds: [],
    });

    saveTutuRenderLibrary();
    renderTutuRenderManager();

    $('#tutu_render_group_name').val('');
    toastr.success(`已新建分组「${name}」`);
});

$(document).on('keydown', '#tutu_render_group_name', function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        $('#tutu_render_group_add_btn').trigger('click');
    }
});

// 重命名分组
$(document).on('click', '.tutu-render-group-rename', function () {
    const id = String($(this).closest('.tutu-render-item').attr('data-id'));
    const group = tutuRenderLibrary.groups.find(item => item.id === id);

    if (!group) return;

    const name = window.prompt('分组名称：', group.name);

    if (name === null || !name.trim()) return;

    group.name = name.trim();
    saveTutuRenderLibrary();
    renderTutuRenderManager();
});

// 正则移动到分组
$(document).on('change', '.tutu-render-group-select', function () {
    const id = String($(this).closest('.tutu-render-item').attr('data-id'));
    const item = tutuRenderLibrary.regex.find(entry => entry.id === id);

    if (!item) return;

    item.groupId = String($(this).val() || '');
    saveTutuRenderLibrary();
    renderTutuRenderManager();
    refreshTutuCurrentRender();
});

// 打开绑定面板
$(document).on('click', '.tutu-render-bind', function () {
    const $row = $(this).closest('.tutu-render-item');

    openTutuRenderBindPanel(
        String($row.attr('data-kind')),
        String($row.attr('data-id'))
    );
});

$(document).on('input', '#tutu_render_bind_panel .tutu-render-bind-search', function () {
    const keyword = String($(this).val() || '').trim().toLowerCase();

    $('#tutu_render_bind_panel .tutu-render-bind-option').each(function () {
        const text = String($(this).attr('data-search') || '');
        $(this).toggle(!keyword || text.includes(keyword));
    });

    $('#tutu_render_bind_panel .tutu-render-bind-category').each(function () {
        $(this).toggle(
            $(this).find('.tutu-render-bind-option').filter(function () {
                return $(this).css('display') !== 'none';
            }).length > 0
        );
    });
});

$(document).on('change', '#tutu_render_bind_panel .tutu-render-bind-category-check', function () {
    $(this)
        .closest('.tutu-render-bind-category')
        .find('.tutu-render-bind-option:visible .tutu-render-bind-check')
        .prop('checked', $(this).is(':checked'));

    syncTutuRenderBindCategoryChecks();
});

$(document).on('change', '#tutu_render_bind_panel .tutu-render-bind-check', function () {
    syncTutuRenderBindCategoryChecks();
});

function saveTutuRenderBinding(ids) {
    const $panel = $('#tutu_render_bind_panel');
    const target = getTutuRenderBindTarget(
        $panel.attr('data-kind'),
        $panel.attr('data-id')
    );

    if (!target) {
        $panel.hide();
        return;
    }

    target.bindScenarioIds = normalizeTutuIdList(ids);

    saveTutuRenderLibrary();
    $panel.hide();
    renderTutuRenderManager();
    refreshTutuCurrentRender();

    toastr.success(
        target.bindScenarioIds.length
            ? `已绑定 ${target.bindScenarioIds.length} 个小剧场条目`
            : '已解除绑定，改为全局生效'
    );
}

$(document).on('click', '#tutu_render_bind_panel .tutu-render-bind-save', function () {
    const ids = $('#tutu_render_bind_panel .tutu-render-bind-check:checked')
        .map(function () {
            return String($(this).val());
        })
        .get();

    saveTutuRenderBinding(ids);
});

$(document).on('click', '#tutu_render_bind_panel .tutu-render-bind-clear', function () {
    saveTutuRenderBinding([]);
});

$(document).on('click', '#tutu_render_bind_panel .tutu-render-bind-cancel', function () {
    $('#tutu_render_bind_panel').hide();
});

// 一键自适应（标签夺舍）
$(document).on('click', '#tutu_render_autofit_btn', function () {
    const updated = applyTutuAutoFitCss();

    renderTutuRenderManager();
    refreshTutuCurrentRender();

    toastr.success(
        updated
            ? '自适应 CSS 已更新并启用'
            : '已添加自适应 CSS，小剧场会自动适配宽度和高度'
    );
});

$(document).on('click', '#tutu_render_css_add_btn', function () {
    const css = extractTutuCssText($('#tutu_render_css_input').val());

    if (!css) {
        toastr.warning('请先输入 CSS');
        return;
    }

    const name =
        String($('#tutu_render_css_name').val() || '').trim() ||
        `自定义 CSS ${tutuRenderLibrary.css.length + 1}`;

    tutuRenderLibrary.css.push({
        id: createTutuRenderId('css'),
        name,
        css,
        source: '手动添加',
        enabled: true,
    });

    saveTutuRenderLibrary();
    renderTutuRenderManager();
    refreshTutuCurrentRender();

    $('#tutu_render_css_name').val('');
    $('#tutu_render_css_input').val('');

    toastr.success(`已添加渲染 CSS「${name}」`);
});

loadTutuSettingsToUI();
loadTutuTypographyToUI();
applyTutuTypographyStyle();
loadTutuOutputFormatToUI();

// 读取历史聊天记录：先显示上次的全局默认，切到具体角色后再按角色刷新
$('#tutu_include_history').prop('checked', Boolean(tutuSettings.historyIncludeEnabled));
$('#tutu_history_limit').val(Number(tutuSettings.historyLimitDefault) || 20);
$('#tutu_history_limit_box').toggle(Boolean(tutuSettings.historyIncludeEnabled));
$('#tutu_history_include_tags').val(tutuSettings.historyIncludeTags || '');
$('#tutu_history_exclude_tags').val(tutuSettings.historyExcludeTags || '');
$('#tutu_history_exclude_comments').prop('checked', tutuSettings.historyExcludeComments !== false);

ensureTutuScenarioIds();
initTutuAutoHeightListener();
renderTutuRenderManager();
renderTutuCategorySelects();
renderTutuImportCategorySelect();
updateTutuImportCategoryVisibility();

renderLibrary();
renderTutuFavorites();



initTutuAutoGenerationListener();


setTimeout(async () => {
    await injectTutuRegex();
}, 1000);



// 切换主 API / 副 API
$(document).on('change', '#tutu_api_provider', function() {
    updateSecondaryApiVisibility();
});

// 最大输出长度：改动即保存，快捷按钮直接填入
$(document).on('input change', '#tutu_secondary_max_tokens', function () {
    tutuSettings.secondaryMaxTokens = normalizeTutuMaxTokens($(this).val());
    persistTutuSettings();
});

$(document).on('click', '.tutu-max-tokens-preset', function () {
    const value = normalizeTutuMaxTokens($(this).attr('data-value'));

    $('#tutu_secondary_max_tokens').val(value || '').trigger('change');
});

// API 选择 / 地址 / 密钥 / 模型：改动即自动保存，下次打开无需重新设置
$(document).on(
    'input change',
    '#tutu_api_provider, #tutu_secondary_endpoint, #tutu_secondary_api_key, #tutu_secondary_model',
    function () {
        tutuSettings.provider =
            $('#tutu_api_provider').val() || 'main';
        tutuSettings.endpoint =
            String($('#tutu_secondary_endpoint').val() || '').trim();
        tutuSettings.apiKey =
            String($('#tutu_secondary_api_key').val() || '').trim();

        const model = String($('#tutu_secondary_model').val() || '').trim();

        // 拉取模型过程中下拉框会暂时为空，此时不覆盖已保存的模型
        if (model || this.id === 'tutu_secondary_model') {
            tutuSettings.model = model;
        }

        persistTutuSettings();
    }
);
$(document).on(
    'click',
    '#tutu_fetch_models_btn',
    async function () {
        try {
            await fetchSecondaryModels();
        } catch (error) {
            console.error(
                '拉取副 API 模型失败：',
                error
            );

            toastr.error(
                error.message || '拉取模型失败'
            );
        }
    }
);


// 保存 API 设置
$(document).on('click', '#tutu_save_settings_btn', function() {
    saveTutuSettings();
    toastr.success('小剧场 API 设置已保存');
});
$(document).on(
    'change',
    '#tutu_auto_generate_enabled, #tutu_auto_generate_mode, #tutu_auto_generate_scope, #tutu_auto_generate_category',
    function () {
        tutuSettings.autoGenerateEnabled =
            $('#tutu_auto_generate_enabled')
                .is(':checked');

        tutuSettings.autoGenerateMode =
            $('#tutu_auto_generate_mode').val() ||
            'current';

        tutuSettings.autoGenerateScope =
            $('#tutu_auto_generate_scope').val() ||
            'all';

        tutuSettings.autoGenerateCategory =
            $('#tutu_auto_generate_category').val() ||
            '';

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        updateAutoCategoryVisibility();
        updateAutoGenerateStatus();
    }
);


// 保存副 API 预设
$(document).on('click', '#tutu_save_api_preset_btn', function() {
    saveCurrentApiPreset();
});

// 载入副 API 预设
$(document).on('click', '#tutu_load_api_preset_btn', function() {
    loadSelectedApiPreset();
});

// 删除副 API 预设
$(document).on('click', '#tutu_delete_api_preset_btn', function() {
    deleteSelectedApiPreset();
});

// 结果显示为预览
$(document).on('click', '#tutu_show_preview_btn', function() {
    showTutuResultMode('preview');
});

// 结果显示为源码
$(document).on('click', '#tutu_show_source_btn', function() {
    showTutuResultMode('source');
});

    function injectTutuButton() {
        if ($('#option_tutu_theater').length > 0) return;
        const $extensionsMenu = $('#extensionsMenu');
        if ($extensionsMenu.length > 0) {
            $extensionsMenu.append(menuButtonHtml);
        } else if ($('#manageAttachments').length > 0) {
            $('#manageAttachments').after(menuButtonHtml);
        }
    }

    injectTutuButton();
$(document).on('click', '#option_tutu_theater', function() {

    const extensionsMenu = document.getElementById('extensionsMenu');
    if (extensionsMenu) {
        extensionsMenu.style.display = 'none';
    }
renderTutuCategorySelects();
renderTutuImportCategorySelect();
updateTutuImportCategoryVisibility();

renderLibrary();
updatePresetFileDropdown();

$('#tutu_worldbook_content')
    .hide();

$('#tutu_worldbook_toggle')
    .removeClass('expanded');

refreshTutuCharacterContext();


    const $panel = $('#tutu_theater_panel');
    const isMobile = window.matchMedia('(max-width: 600px)').matches;

    // 先清除旧状态
    $panel.stop(true, true).removeClass('tutu-mobile-mode');

    if (isMobile) {
        $panel.addClass('tutu-mobile-mode');
    }

    // 用 cssText 强制重置定位，防止残留内联样式
    $panel[0].style.cssText =
        'display:flex; opacity:0;' +
        'top:50%; left:50%; transform:translate(-50%,-50%);';

    $panel.animate({ opacity: 1 }, 200);
});




    // 监听类型下拉框改变：切换系统/OAI预设
    $(document).on('change', '#tutu_preset_type', function() {
        updateTutuImportCategoryVisibility();
        updatePresetFileDropdown();
    });

    // 监听文件下拉框改变：读取对应文件
    $(document).on('change', '#tutu_preset_file', function() {
        fetchAndRenderNativePrompts();
    });


$(document).on('click', '#tutu_close', function() {
    $('#tutu_theater_panel')
        .stop(true, true)
        .animate({ opacity: 0 }, 200, function() {
            $(this)[0].style.cssText = 'display:none;';
            $(this).removeClass('tutu-mobile-mode');
        });
});





    // 全选/取消全选
    $('#tutu_select_all').on('change', function() {
        const isChecked = $(this).is(':checked');
        $('.tutu-import-checkbox').prop('checked', isChecked);
    });

$('#tutu_import_selected_btn').on(
    'click',
    function () {
        const checkedBoxes =
            $('.tutu-import-checkbox:checked');

        if (!checkedBoxes.length) {
            toastr.warning(
                '请至少勾选一个要导入的条目！'
            );
            return;
        }

        const importTarget =
            String(
                $('#tutu_import_target').val() ||
                'scenario'
            );

        // 预设绑定正则 → 渲染正则库
        if ($('#tutu_preset_type').val() === 'openai_regex') {
            const presetName = String($('#tutu_preset_file').val() || '');
            let count = 0;

            checkedBoxes.each(function () {
                const item =
                    window.tutuTempNativePrompts?.[Number($(this).val())];
                const script = item?.regexScript;

                if (!script?.findRegex) return;

                const record = {
                    id: createTutuRenderId('rx'),
                    scriptName: String(script.scriptName || item.name),
                    findRegex: String(script.findRegex),
                    replaceString: String(script.replaceString ?? ''),
                    trimStrings: Array.isArray(script.trimStrings)
                        ? script.trimStrings
                        : [],
                    substituteRegex: Number(script.substituteRegex) || 0,
                    source: presetName,
                    enabled: !script.disabled,
                    groupId: '',
                    bindScenarioIds: [],
                };

                // 同预设、同名的正则覆盖更新，避免重复导入
                const oldIndex = tutuRenderLibrary.regex.findIndex(
                    rx =>
                        rx.source === record.source &&
                        rx.scriptName === record.scriptName
                );

                if (oldIndex >= 0) {
                    const old = tutuRenderLibrary.regex[oldIndex];
                    // 覆盖更新时保留分组和条目绑定
                    record.id = old.id;
                    record.groupId = old.groupId || '';
                    record.bindScenarioIds = old.bindScenarioIds || [];
                    tutuRenderLibrary.regex[oldIndex] = record;
                } else {
                    tutuRenderLibrary.regex.push(record);
                }

                count++;
            });

            if (!count) {
                toastr.warning('所选条目没有可导入的正则');
                return;
            }

            saveTutuRenderLibrary();
            renderTutuRenderManager();
            refreshTutuCurrentRender();
            toastr.success(`成功导入 ${count} 个渲染正则`);
            switchTutuTab('tutu_tab_settings');
            return;
        }

        // 预设 / 世界书条目 → 渲染 CSS
        if (importTarget === 'render_css') {
            const sourceName = String($('#tutu_preset_file').val() || '');
            let count = 0;

            checkedBoxes.each(function () {
                const item =
                    window.tutuTempNativePrompts?.[Number($(this).val())];
                const css = extractTutuCssText(item?.prompt || '');

                if (!css) return;

                tutuRenderLibrary.css.push({
                    id: createTutuRenderId('css'),
                    name: String(item.name || '导入的 CSS'),
                    css,
                    source: sourceName,
                    enabled: true,
                });

                count++;
            });

            if (!count) {
                toastr.warning('所选条目没有可导入的 CSS');
                return;
            }

            saveTutuRenderLibrary();
            renderTutuRenderManager();
            refreshTutuCurrentRender();
            toastr.success(`成功导入 ${count} 段渲染 CSS`);
            switchTutuTab('tutu_tab_settings');
            return;
        }
const importCategory =
    String(
        $('#tutu_import_category').val() ||
        ''
    ).trim();

if (
    importTarget === 'scenario' &&
    !importCategory
) {
    toastr.warning('请选择要导入到的剧本分类');
    return;
}
        let importedCount = 0;
        let firstImportedId = '';
        const importedAuxIds = [];

        checkedBoxes.each(function () {
            const index =
                Number($(this).val());

            const item =
                window.tutuTempNativePrompts?.[index];

            if (!item) {
                return;
            }

            const name =
                String(
                    item.name ||
                    `导入条目 ${index + 1}`
                ).trim();

            const content =
                String(
                    item.prompt ||
                    item.content ||
                    item.value ||
                    ''
                ).trim();

            if (!content) {
                return;
            }

            /*
             * 导入为普通剧本
             */
if (importTarget === 'scenario') {
    tutuScenarios.push({
        name,
        desc: '从系统预设或世界书导入',
        category: importCategory,
        prompt: content,
    });

    if (
        !tutuCategories.includes(
            importCategory
        )
    ) {
        tutuCategories.push(
            importCategory
        );
    }

    importedCount++;
    return;
}

            /*
             * 导入为破限或文风
             */
            if (AUX_PROMPT_TYPES.includes(importTarget)) {
                const record =
                    saveTutuAuxPromptRecord(
                        importTarget,
                        name,
                        content
                    );

                if (!firstImportedId) {
                    firstImportedId = record.id;
                }

                importedAuxIds.push(record.id);
                importedCount++;
            }
        });

        if (!importedCount) {
            toastr.warning(
                '所选条目没有可导入的正文'
            );
            return;
        }
if (importTarget === 'scenario') {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );

    tutuExpandedCategories.add(
        importCategory
    );

    saveTutuExpandedCategories();
            saveTutuCategories();

            renderLibrary();
            renderTutuCategorySelects();

            switchTutuTab(
                'tutu_tab_library'
            );

            toastr.success(
                `成功导入 ${importedCount} 个剧本`
            );

            return;
        }

        /*
         * 导入提示词后，本次导入的条目全部勾选为启用（追加到已勾选的后面）。
         */
        if (AUX_PROMPT_TYPES.includes(importTarget) && importedAuxIds.length) {
            setTutuActiveAuxIds(importTarget, [
                ...getTutuActiveAuxIds(importTarget),
                ...importedAuxIds,
            ]);
        }

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        renderTutuAuxPromptManager();

        const label =
            getTutuAuxPromptTypeLabel(
                importTarget
            );

        toastr.success(
            `成功导入 ${importedCount} 个${label}提示词`
        );

        switchTutuTab(
            'tutu_tab_settings'
        );
    }
);

// 点击“新建剧本”
$(document).on('click', '#tutu_new_script_btn', function() {
    openScriptEditor(-1);
});

// 点击“取消编辑”
$(document).on('click', '#tutu_cancel_edit_btn', function() {
    editingScriptIndex = -1;
    $('#tutu_script_editor').slideUp(150);
});

// 保存新建或编辑的剧本
$(document).on('click', '#tutu_save_btn', function() {
const name =
    $('#tutu_script_name').val().trim();

const desc =
    $('#tutu_script_desc').val().trim();

const category =
    $('#tutu_script_category').val().trim() ||
    '未分类';

const prompt =
    $('#tutu_script_prompt').val().trim();


    if (!name) {
        toastr.warning('请输入剧本名称！');
        return;
    }

    if (!prompt) {
        toastr.warning('请输入剧本内容！');
        return;
    }

const newScript = {
    // 编辑时保留原 id，渲染正则的条目绑定才不会失效
    id:
        (editingScriptIndex !== -1 &&
            tutuScenarios[editingScriptIndex]?.id) ||
        createTutuRenderId('sc'),
    name,
    desc,
    category,
    prompt
};


if (editingScriptIndex === -1) {
    tutuScenarios.push(newScript);
    toastr.success(`剧本 [${name}] 已创建！`);
} else {
    tutuScenarios[editingScriptIndex] = newScript;
    toastr.success(`剧本 [${name}] 已更新！`);
}

if (!tutuCategories.includes(category)) {
    tutuCategories.push(category);
}

saveTutuCategories();


    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );

    renderLibrary();
    renderTutuCategorySelects();

    editingScriptIndex = -1;
    $('#tutu_script_editor').slideUp(150);
});
// 查看 / 隐藏剧本内容
$(document).on('click', '.tutu-view-script-btn', function () {
    const $card = $(this).closest('.tutu-script-card');
    const $content = $card.find('.tutu-script-content');
    const $icon = $(this).find('i');

    if ($content.is(':visible')) {
        $content.slideUp(150);
        $icon.attr('class', 'fa-solid fa-eye');
        $(this).attr('title', '查看剧本内容');
    } else {
        $content.slideDown(150);
        $icon.attr('class', 'fa-solid fa-eye-slash');
        $(this).attr('title', '隐藏剧本内容');
    }
});
// 单独导出剧本
$(document).on(
    'click',
    '.tutu-export-script-btn',
    function (event) {
        event.preventDefault();
        event.stopPropagation();

        const index =
            Number($(this).attr('data-index'));

        exportTutuSingleScenario(index);
    }
);

// 载入剧本到生成页面
$(document).on('click', '.tutu-load-script-btn', function() {
    // 获取当前按钮上的剧本编号
    const index = Number($(this).data('index'));

    // 根据编号找到对应的剧本
    const item = tutuScenarios[index];

    // 如果没有找到剧本，就停止
    if (!item) {
        toastr.error('找不到这个剧本');
        return;
    }

    // 把剧本正文放进“生成”标签页的输入框
    $('#tutu_prompt').val(item.prompt || '');

    // 切换到“生成”标签页
    switchTutuTab('tutu_tab_generate');

    // 提示用户
    toastr.info(`已载入：${item.name}`, '克制放映室');
});

// 编辑剧本
$(document).on('click', '.tutu-edit-script-btn', function() {
    const index = Number($(this).data('index'));
    openScriptEditor(index);
});

// 删除剧本
$(document).on('click', '.tutu-delete-script-btn', function() {
    const index = Number($(this).data('index'));
    const item = tutuScenarios[index];

    if (!item) return;

    const confirmed = confirm(`确定要删除剧本「${item.name}」吗？`);

    if (!confirmed) return;

    tutuScenarios.splice(index, 1);

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );

    renderLibrary();

    toastr.success('剧本已删除');
});


// 手动生成小剧场
$(document).on(
    'click',
    '#tutu_generate_btn',
    function () {
        // 生成中再次点击 = 取消生成
        if (tutuIsGenerating) {
            cancelTutuGeneration();
            return;
        }

        const scenario = String(
            $('#tutu_prompt').val() || ''
        ).trim();

        runTutuGeneration({
            scenario,
            isAutomatic: false,
        });
    }
);

// 续写：以当前结果为开头，继续生成本轮
$(document).on(
    'click keydown',
    '#tutu_continue_current_btn',
    function (event) {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();

        if (tutuIsGenerating) {
            toastr.info('正在生成中，可点击停止按钮取消');
            return;
        }

        const previous = String(tutuCurrentResultContent || '');

        if (!previous.trim()) {
            toastr.warning('还没有可续写的内容，请先生成小剧场');
            return;
        }

        // 优先沿用上次生成的情境；刷新页面后没有记录，使用输入框里的情境
        const scenario =
            tutuLastGenerationScenario ||
            String($('#tutu_prompt').val() || '').trim() ||
            '继续完成上一轮的小剧场';

        runTutuGeneration({
            scenario,
            isAutomatic: false,
            scenarioId:
                tutuLastGenerationScenarioId ||
                getTutuContentScenarioId(previous) ||
                '',
            continueFrom: previous,
        });
    }
);

});
