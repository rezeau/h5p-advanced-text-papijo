/* Occurrence-local plain-text Caption UI, using public CKEditor view/balloon APIs. */
(function (H5PEditor, managed) {
  'use strict';
  var key = 'papijoImageCaption';

  function assess(editor, target, valid) {
    if (!target || !target.is('element', 'imageInline') || editor.isReadOnly ||
        !target.root.isAttached() || target.root.rootName === '$graveyard' ||
        editor.model.document.getRoot(target.root.rootName) !== target.root || !valid(target)) { return false; }
    if (managed.normalizeCaption(target.getAttribute(key))) { return true; }
    var state = H5PEditor.AdvancedTextPapiJoInlineImageParagraph.assess(editor, target, valid);
    return !!state && state.mode === 'only';
  }

  function install(editor, valid, ButtonView, translate) {
    var Command = Object.getPrototypeOf(editor.commands.get('imageTextAlternative').constructor.prototype).constructor;
    var View = Object.getPrototypeOf(ButtonView.prototype).constructor;
    var balloon = editor.plugins.get('ContextualBalloon');
    var form = null, session = null, destroyed = false, focusRegistered = false;
    function selected() { return editor.model.document.selection.getSelectedElement(); }
    function current() {
      return !destroyed && session && assess(editor, session.target, valid) &&
        session.target.getAttribute('inlineImageId') === session.id &&
        managed.normalizeCaption(session.target.getAttribute(key)) === session.caption;
    }
    function focusEditor() {
      if (!destroyed) { editor.editing.view.getDomRoot().focus(); editor.editing.view.focus(); }
    }
    function close(focus) {
      session = null;
      if (form && balloon.hasView(form)) { balloon.remove(form); }
      if (focus) { focusEditor(); }
    }
    function error(message) { form.error.textContent = translate(message); form.input.focus(); }
    function apply(remove) {
      if (!current()) { error('captionTargetUnavailable'); return; }
      var result = remove ? { value: null, error: null } : managed.validateCaption(form.input.value);
      if (result.error) { error(result.error === 'length' ? 'captionTooLong' : 'captionInvalid'); return; }
      var target = session.target;
      if (result.value !== session.caption) {
        editor.model.change(function (writer) {
          if (!current()) { return; }
          if (result.value) { writer.setAttribute(key, result.value, target); }
          else { writer.removeAttribute(key, target); }
          writer.setSelection(target, 'on');
        });
      }
      close(true);
    }
    function keyboard(event) {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); close(true);
      }
      else if (event.key === 'Tab') {
        var controls = [form.input, form.apply.element, form.cancel.element];
        if (form.remove.isVisible) { controls.push(form.remove.element); }
        var index = controls.indexOf(form.element.ownerDocument.activeElement);
        event.preventDefault(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
      }
    }
    function createForm() {
      var id = 'papijo-caption-input-' + managed.createId();
      form = new View(editor.locale);
      form.apply = new ButtonView(editor.locale);
      form.cancel = new ButtonView(editor.locale);
      form.remove = new ButtonView(editor.locale);
      [[form.apply, 'applyCaption'], [form.cancel, 'cancel'], [form.remove, 'removeImageCaption']].forEach(function (entry) {
        entry[0].set({ label: translate(entry[1]), withText: true, tooltip: true });
      });
      form.setTemplate({ tag: 'form', attributes: { class: ['ck', 'ck-reset', 'papijo-image-caption-form'],
        'aria-label': translate('imageCaption') }, children: [
        { tag: 'label', attributes: { for: id }, children: [translate('imageCaption')] },
        { tag: 'textarea', attributes: { id: id, rows: 3, class: ['ck', 'ck-input', 'ck-input-text'],
          'aria-describedby': id + '-error' } },
        { tag: 'p', attributes: { id: id + '-error', role: 'alert', class: ['papijo-caption-error'] } },
        form.apply, form.cancel, form.remove
      ] });
      form.render();
      form.input = form.element.querySelector('textarea');
      form.error = form.element.querySelector('[role="alert"]');
      form.focus = function () { form.input.focus(); };
      form.element.addEventListener('keydown', keyboard);
      form.element.addEventListener('submit', submit);
      form.apply.on('execute', function () { apply(false); });
      form.cancel.on('execute', function () { close(true); });
      form.remove.on('execute', function () { apply(true); });
      editor.ui.focusTracker.add(form.element); focusRegistered = true;
    }
    function submit(event) { event.preventDefault(); apply(false); }
    class CaptionCommand extends Command {
      refresh() {
        var image = selected();
        this.isEnabled = !destroyed && assess(editor, image, valid);
        this.value = !!(image && managed.normalizeCaption(image.getAttribute(key)));
      }
      execute() {
        var target = selected();
        if (destroyed || !assess(editor, target, valid)) { return; }
        close(false);
        if (!form) { createForm(); }
        session = { target: target, id: target.getAttribute('inlineImageId'),
          caption: managed.normalizeCaption(target.getAttribute(key)) };
        form.input.value = session.caption || ''; form.error.textContent = '';
        form.remove.isVisible = !!session.caption;
        var view = editor.editing.mapper.toViewElement(target);
        balloon.add({ view: form, position: { target: editor.editing.view.domConverter.mapViewToDom(view) } });
        form.focus();
      }
    }
    var command = new CaptionCommand(editor);
    // Local controller handles are exposed for automated interaction, not native internals.
    Object.defineProperty(command, 'form', { get: function () { return form; } });
    editor.commands.add('papijoImageCaption', command);
    editor.ui.componentFactory.add('papijoImageCaption', function () {
      var button = new ButtonView(editor.locale);
      button.set({ withText: false, tooltip: true,
        icon: '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2 2h16v10H2V2zm2 2v6h12V4H4zm-2 10h16v2H2v-2zm3 3h10v2H5v-2z"/></svg>' });
      button.bind('label').to(command, 'value', function (value) { return translate(value ? 'editImageCaption' : 'addImageCaption'); });
      button.bind('isEnabled').to(command, 'isEnabled');
      button.on('execute', function () { editor.execute('papijoImageCaption'); });
      return button;
    });
    editor.listenTo(editor, 'change:isReadOnly', function () { command.refresh(); });
    editor.once('destroy', function () {
      close(false); destroyed = true;
      if (form) {
        if (focusRegistered) { editor.ui.focusTracker.remove(form.element); }
        form.element.removeEventListener('keydown', keyboard);
        form.element.removeEventListener('submit', submit);
        form.destroy(); form = null;
      }
    });
  }
  H5PEditor.AdvancedTextPapiJoInlineImageCaption = { assess: assess, install: install };
})(H5PEditor, PapijoManagedInlineImages);
