/**
 * i18n.js — LTZZZ 极简中英文切换引擎
 *
 * 【接入步骤】
 * 1. 在页面 </body> 前引入本文件：<script src="i18n.js"></script>
 * 2. 在引入 i18n.js 之前，定义本页翻译字典：
 *    <script>
 *    window.I18N_DICT = {
 *      zh: { "nav.home": "首页", "hero.title": "标题" },
 *      en: { "nav.home": "Home", "hero.title": "Title" }
 *    };
 *    </script>
 * 3. 在需要翻译的元素上加 data-i18n="键名"，例如：
 *    <h1 data-i18n="hero.title">标题</h1>
 * 4. 含 HTML 子元素（如 <br>、<span>）的元素加 data-i18n-html：
 *    <h1 data-i18n="hero.title" data-i18n-html>标题<br>副标题</h1>
 * 5. 切换按钮加 data-i18n-toggle，点击即切换：
 *    <button data-i18n-toggle type="button">中文 | English</button>
 *
 * 【规则】
 * - 默认中文（zh），偏好存 localStorage，切换不刷新页面、不改变 URL
 * - 键名缺失时保留元素原始文本（即中文兜底）
 * - 翻译字典放在各页面内，本文件不包含任何页面专属翻译
 * - 不要在此文件中硬编码 API Key、Worker 地址等敏感信息
 */
(function () {
  var STORAGE_KEY = 'ltzzz_lang';
  var DEFAULT_LANG = 'zh';

  function getLang() {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    } catch (e) {
      return DEFAULT_LANG;
    }
  }

  function setLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) { /* localStorage 不可用时静默忽略 */ }
    applyLang(lang);
  }

  function applyLang(lang) {
    var dict = (window.I18N_DICT && window.I18N_DICT[lang]) || {};
    document.documentElement.lang = (lang === 'zh') ? 'zh-CN' : 'en';

    // 翻译文本内容
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) {
        if (el.hasAttribute('data-i18n-html')) {
          el.innerHTML = dict[key];
        } else {
          el.textContent = dict[key];
        }
      }
    }

    // 翻译 placeholder
    var phs = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < phs.length; j++) {
      var ph = phs[j];
      var pkey = ph.getAttribute('data-i18n-placeholder');
      if (dict[pkey] !== undefined) {
        ph.placeholder = dict[pkey];
      }
    }

    // 翻译 document.title（可选，字典中用 "_title" 作为键）
    if (dict['_title'] !== undefined) {
      document.title = dict['_title'];
    }
  }

  // 事件委托：点击任何带 data-i18n-toggle 的元素切换语言
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest && e.target.closest('[data-i18n-toggle]');
    if (toggle) {
      var current = getLang();
      setLang(current === 'zh' ? 'en' : 'zh');
    }
  });

  function init() {
    applyLang(getLang());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露极简 API，供页面脚本按需调用
  window.I18N = { get: getLang, set: setLang };
})();
