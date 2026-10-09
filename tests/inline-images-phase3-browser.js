/* Focused Phase 3 checks, using the existing real-build harness helpers. */
window.runPapijoInlineImagePhase3 = async function (h) {
  'use strict';
  var assert = h.assert;
  var managed = PapijoManagedInlineImages;
  var id = 'phase3-shared';
  var definition = { id: id, image: { path: 'images/photo.png', mime: 'image/png' }, alt: 'Phase 3 photo' };
  function marker(style, reference) {
    return '<span class="papijo-inline-image" data-papijo-inline-image-id="' + (reference || id) + '"' +
      (style ? ' data-papijo-inline-image-style="' + style + '"' : '') + '></span>';
  }
  function check(ctx, style, reference) {
    var image = h.imageModel(ctx);
    assert(image.name === 'imageInline' && image.getAttribute('inlineImageId') === (reference || id), 'Style must preserve inline model and ID');
    assert(image.getAttribute('imageStyle') === (style || undefined), 'Unexpected model presentation');
    assert(ctx.editor.getData().includes(marker(style, reference)), 'Exact occurrence serialization missing: ' + ctx.editor.getData());
    assert(!/src=|alt=|width=|height=|image-style-|style=|href=/.test(
      ctx.editor.getData().replace(/data-papijo-inline-image-style=/g, 'presentation=')), 'Preview attributes or native classes leaked');
    assert(!image.hasAttribute('width') && !image.hasAttribute('height'), 'Native styles must not set image dimensions');
    assert(!ctx.editor.plugins.has('ImageBlockEditing') && !ctx.editor.commands.get('imageTypeBlock'), 'Block image editing must stay absent');
  }
  async function styleButton(ctx, value) {
    await h.selectImage(ctx);
    var toolbar = ctx.editor.plugins.get('ContextualBalloon').visibleView;
    var index = ['inline', 'alignLeft', 'alignRight'].indexOf(value);
    var button = Array.from(toolbar.items)[index];
    var title = ['In line', 'Left aligned image', 'Right aligned image'][index];
    assert(button.label === ctx.editor.t(title) && button.icon && button.tooltip &&
      button.element.querySelector('svg'), 'Native translated style icon/tooltip missing');
    assert(toolbar.element.querySelectorAll('button').length === 7, 'Contextual toolbar has unexpected commands');
    button.element.click();
    assert(button.isOn, 'Native active style state missing');
  }
  var ctx = await h.open('<p>' + marker() + '</p>', [definition]);
  check(ctx, null);
  var original = JSON.stringify(ctx.store.params);
  for (var style of ['alignLeft', 'alignRight']) {
    await styleButton(ctx, style);
    check(ctx, style);
    assert(JSON.stringify(ctx.store.params) === original, 'Style must not change the definition or alt');
    assert(getComputedStyle(ctx.editor.editing.view.getDomRoot()).display === 'flow-root', 'Editor must contain its floats');
    ctx.editor.execute('undo'); check(ctx, null);
    ctx.editor.execute('redo'); check(ctx, style);
    var reopened = await h.open(ctx.editor.getData(), JSON.parse(JSON.stringify(ctx.store.params)));
    check(reopened, style); await h.close(reopened);
    await styleButton(ctx, 'inline'); check(ctx, null);
    assert(!ctx.editor.editing.view.getDomRoot().classList.contains(managed.floatRootClass), 'Default editor must not change formatting context');
  }
  for (var bad of ['alignCenter', 'alignBlockLeft', 'alignBlockRight', 'block', 'side', ' alignLeft', 'arbitrary']) {
    ctx.editor.setData('<p>' + marker(bad) + '</p>'); check(ctx, null);
    ctx.editor.execute('imageStyle', { value: bad }); check(ctx, null);
    ctx.editor.model.change(function (writer) { writer.setAttribute('imageStyle', bad, h.imageModel(ctx)); });
    check(ctx, null);
  }
  ctx.editor.setData('<p>' + marker() + '</p>');
  await styleButton(ctx, 'alignLeft');
  await h.selectImage(ctx); var form = h.altForm(ctx); h.submitAlt(form, 'Revised styled photo');
  var revisedId = h.imageModel(ctx).getAttribute('inlineImageId');
  check(ctx, 'alignLeft', revisedId);
  assert(ctx.store.params.length === 2 && h.imageModel(ctx).getAttribute('alt') === 'Revised styled photo', 'Alt must retain style and previous definition');
  await styleButton(ctx, 'alignRight'); check(ctx, 'alignRight', revisedId);
  ctx.editor.execute('undo'); check(ctx, 'alignLeft', revisedId);
  ctx.editor.execute('undo'); check(ctx, 'alignLeft');
  assert(h.imageModel(ctx).getAttribute('alt') === definition.alt, 'Combined history must restore old alt');
  ctx.editor.execute('undo'); check(ctx, null);
  ctx.editor.execute('redo'); check(ctx, 'alignLeft');
  ctx.editor.execute('redo'); check(ctx, 'alignLeft', revisedId);
  ctx.editor.execute('redo'); check(ctx, 'alignRight', revisedId);
  for (var key of [['Delete', 46], ['Backspace', 8]]) {
    await h.selectImage(ctx);
    var beforeDelete = ctx.editor.getData(); var count = ctx.store.params.length;
    ['keydown', 'keyup'].forEach(function (type) {
      ctx.editor.editing.view.getDomRoot().dispatchEvent(new KeyboardEvent(type,
        { key: key[0], keyCode: key[1], bubbles: true, cancelable: true }));
    });
    assert(!h.imageModel(ctx) && ctx.store.params.length === count, 'Styled deletion must retain definitions');
    ctx.editor.execute('undo');
    assert(ctx.editor.getData() === beforeDelete, 'Deletion undo must restore styled occurrence');
  }
  ctx.editor.setData('<p>' + marker() + ' and ' + marker() + '</p>');
  await h.selectImage(ctx, 1);
  ctx.editor.execute('imageStyle', { value: 'alignRight' });
  assert(!h.imageModel(ctx).hasAttribute('imageStyle') && h.imageModel(ctx, 1).getAttribute('imageStyle') === 'alignRight', 'Repeated references need independent presentation');
  assert(h.imageModel(ctx, 1).getAttribute('inlineImageId') === id && ctx.store.params.length === 2, 'Repeated style must not create definitions');
  var peer = await h.open('<p>' + marker('alignLeft') + '</p>', [definition]);
  check(peer, 'alignLeft');
  assert(!h.imageModel(ctx).hasAttribute('imageStyle'), 'Sibling instance style must remain independent');
  await h.close(peer); await h.close(ctx);

  var contexts = [
    '<p>Before ' + marker() + ' after</p>',
    '<h2>Before ' + marker() + ' after</h2>',
    '<ul><li>Before ' + marker() + ' after</li></ul>',
    '<table><tbody><tr><td><p>' + marker() + '</p></td><td><p>Cell</p></td></tr></tbody></table>',
    '<p><a href="https://example.com/">Ordinary link</a> ' + marker() + '</p>',
    '<p><span class="papijo-tooltip" data-papijo-tooltip="Explanation">Term</span> ' + marker() + '</p>'
  ];
  for (var html of contexts) {
    ctx = await h.open(html, [definition]);
    var parent = h.imageModel(ctx).parent.name;
    var before = ctx.editor.getData();
    for (style of ['alignLeft', 'alignRight']) {
      await styleButton(ctx, style);
      assert(h.imageModel(ctx).parent.name === parent, 'Native inline styles must not split surrounding structure');
      assert(ctx.editor.getData().replace(' data-papijo-inline-image-style="' + style + '"', '') === before, 'Only presentation may change in this context');
      if (html.includes('<table>')) {
        var paragraph = ctx.editor.model.document.getRoot().getChild(0).getChild(0).getChild(1).getChild(0);
        ctx.editor.model.change(function (writer) { writer.setSelection(paragraph, 0); });
        ctx.editor.editing.view.focus(); ctx.editor.ui.update();
        assert(ctx.editor.plugins.get('ContextualBalloon').visibleView.element.querySelectorAll('button').length > 4, 'Table toolbar must still appear after styled image');
      }
    }
    await h.close(ctx);
  }
  for (var language of ['en', 'fr']) {
    ctx = await h.open('<p>' + marker() + '</p>', [definition], language);
    ctx.shell.css('width', '240px');
    for (style of ['alignLeft', 'alignRight', 'inline']) {
      await styleButton(ctx, style);
      var toolbar = ctx.editor.plugins.get('ContextualBalloon').visibleView;
      assert(toolbar.element.getBoundingClientRect().width <= ctx.shell[0].getBoundingClientRect().width,
        'Contextual image controls must fit the narrow editor width');
      Array.from(toolbar.items).filter(function (item) { return item.element.tagName === 'BUTTON'; }).forEach(function (button) {
        assert(button.element.getAttribute('aria-labelledby') &&
          (!button.element.disabled || button.label === H5PEditor.t('H5PEditor.AdvancedTextPapiJoTooltip', 'resetImageSize')),
          'Native controls need accessible names; Reset is disabled at default size');
      });
      var item = Array.from(toolbar.items)[0]; item.focus();
      assert(document.activeElement === item.element, 'Native style button must accept keyboard focus');
      toolbar.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
      assert(document.activeElement !== item.element, 'Native contextual toolbar arrow navigation must work');
      ctx.editor.editing.view.focus();
    }
    assert(ctx.editor.t('In line') !== 'In line' || language === 'en', 'French style translations must be loaded');
    await h.close(ctx);
  }

  // Native H5P content clipboard keeps occurrence attributes independent of files.
  var savedClipboard = localStorage.getItem('h5pClipboard'); var savedId = H5PEditor.contentId;
  try {
    var params = { text: '<p>' + marker('alignLeft') + marker('alignRight') + '</p>', inlineImages: [definition] };
    H5PEditor.contentId = 'source';
    H5P.clipboardify({ library: 'H5P.AdvancedTextPapiJo 1.2', params: params });
    H5PEditor.contentId = 'destination';
    var copied = H5P.getClipboard().generic.params;
    assert(copied.text === params.text && copied.inlineImages[0].image.path === '../source/images/photo.png', 'Content clipboard must preserve style and managed path rewriting');
    ctx = await h.open(copied.text, copied.inlineImages);
    assert(h.imageModel(ctx).getAttribute('imageStyle') === 'alignLeft' && h.imageModel(ctx, 1).getAttribute('imageStyle') === 'alignRight', 'Copied styles must reconstruct independently');
    await h.close(ctx);
  }
  finally {
    H5PEditor.contentId = savedId;
    if (savedClipboard === null) { localStorage.removeItem('h5pClipboard'); }
    else { localStorage.setItem('h5pClipboard', savedClipboard); }
  }

  // Exercise real large image bytes and CSS, rather than mocked dimensions.
  var originalGetPath = H5P.getPath;
  H5P.getPath = function () { return '/fixture-large.svg'; };
  try {
    for (style of [null, 'alignLeft', 'alignRight', 'unsupported']) {
      var $layout = H5P.jQuery('<div>').css({ width: '220px' }).appendTo('#fixture');
      var $root = H5P.jQuery('<div>').appendTo($layout);
      var $sibling = H5P.jQuery('<div>').text('Next H5P child').appendTo($layout);
      var runtime = new H5P.AdvancedTextPapiJo({ text: '<p>' + marker(style) + ' Surrounding text</p>', inlineImages: [definition] }, 27);
      runtime.attach($root);
      var image = $root.find('img')[0]; await image.decode();
      assert(image.naturalWidth === 1280, 'Large fixture must load actual image bytes');
      var wrapper = image.parentNode; var rootRect = $root[0].getBoundingClientRect();
      var imageRect = image.getBoundingClientRect(); var wrapperRect = wrapper.getBoundingClientRect();
      assert(imageRect.width <= 221 && Math.abs(imageRect.height / imageRect.width - 0.75) < 0.02, 'Large images must fit narrow root with aspect ratio');
      var expectedFloat = style === 'alignLeft' ? 'left' : style === 'alignRight' ? 'right' : 'none';
      assert(getComputedStyle(wrapper).float === expectedFloat, 'Runtime presentation must map only supported values');
      if (expectedFloat !== 'none') {
        var flow = $root[0].querySelector(':scope > .papijo-inline-image-flow');
        assert(flow && getComputedStyle(flow).display === 'flow-root' && rootRect.bottom >= wrapperRect.bottom - 1, 'Root must include full floated image height');
        assert($sibling[0].getBoundingClientRect().top >= imageRect.bottom - 1, 'Adjacent H5P content must not wrap around float');
      }
      else { assert(!$root[0].classList.contains(managed.floatRootClass), 'Default and invalid presentation must not activate containment'); }
      var beforeResize = runtime.events.length;
      image.dispatchEvent(new Event('load')); image.dispatchEvent(new Event('error'));
      assert(runtime.events.length === beforeResize + 2, 'Styled images must retain load/error resize notifications');
      runtime.attach($root); await $root.find('img')[0].decode();
      assert($root.find('img').length === 1, 'Reattachment must rebuild without duplication');
      assert($root.find('.papijo-inline-image-flow').length === (expectedFloat === 'none' ? 0 : 1), 'Reattachment must not nest flow containers');
      $layout.remove();
    }
    var $tableRoot = H5P.jQuery('<div>').css('width', '240px').appendTo('#fixture');
    new H5P.AdvancedTextPapiJo({ text: '<figure class="table"><table><tbody><tr><td>Cell</td></tr></tbody></table></figure><p>' + marker('alignLeft') + '</p>', inlineImages: [definition] }, 27).attach($tableRoot);
    await $tableRoot.find('img')[0].decode();
    assert(getComputedStyle($tableRoot.find('figure.table').next()[0]).clear === 'both', 'Special post-table clearing must remain');
    $tableRoot.remove();
  }
  finally { H5P.getPath = originalGetPath; }
  h.results.push('Phase 3: native presentation/localized keyboard UI, enum/security, exact save/reopen, occurrence isolation, alt/style/delete history, contexts, content clipboard, real narrow runtime and float containment');
};
