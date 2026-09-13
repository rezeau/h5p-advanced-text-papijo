'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootPath = path.resolve(__dirname, '..');
const bubbleSource = fs.readFileSync(
  path.join(rootPath, 'advanced-text-papijo-speech-bubble.js'),
  'utf8'
);
const runtimeSource = fs.readFileSync(
  path.join(rootPath, 'advanced-text-papijo-tooltip-runtime.js'),
  'utf8'
);
const textSource = fs.readFileSync(path.join(rootPath, 'text.js'), 'utf8');

function loadConstructors(document) {
  const H5P = {};
  const context = { document, H5P, window: document && document.defaultView };
  vm.runInNewContext(bubbleSource, context);
  vm.runInNewContext(runtimeSource, context);
  return H5P;
}

function rect(top, bottom, height) {
  return { bottom, height, left: 0, top, width: 300 };
}

function createDocument() {
  const listeners = Object.create(null);
  const document = {
    addEventListener(type, listener) {
      (listeners[type] || (listeners[type] = [])).push(listener);
    },
    createElement() {
      return {
        attributes: {},
        className: '',
        parentNode: null,
        style: {},
        remove() {
          if (this.parentNode) {
            this.parentNode.children = this.parentNode.children.filter(
              child => child !== this
            );
            this.parentNode = null;
          }
        },
        setAttribute(name, value) {
          this.attributes[name] = value;
        }
      };
    },
    dispatch(type, target) {
      (listeners[type] || []).slice().forEach(listener => listener({ target }));
    },
    listeners,
    removeEventListener(type, listener) {
      listeners[type] = (listeners[type] || []).filter(
        candidate => candidate !== listener
      );
    }
  };
  return document;
}

function createRoot(document) {
  return {
    children: [],
    classList: { remove() {} },
    isConnected: false,
    ownerDocument: document,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
    },
    querySelectorAll() {
      return [];
    }
  };
}

test('rendered-height plan preserves below and above text tooltip placement', () => {
  const H5P = loadConstructors(createDocument());
  const plan = H5P.AdvancedTextPapiJoSpeechBubble.getLayoutPlan;

  assert.deepEqual(
    { ...plan(rect(200, 220, 20), rect(0, 80, 80), rect(100, 500, 400), 0) },
    { direction: 'below', fits: true, reservedSpace: 0 }
  );
  assert.deepEqual(
    { ...plan(rect(420, 440, 20), rect(0, 80, 80), rect(100, 500, 400), 0) },
    { direction: 'above', fits: true, reservedSpace: 0 }
  );
});

test('plan reserves only the missing natural space when neither side fits', () => {
  const H5P = loadConstructors(createDocument());
  const plan = H5P.AdvancedTextPapiJoSpeechBubble.getLayoutPlan;

  assert.deepEqual(
    {
      ...plan(
        rect(150, 170, 20),
        rect(0, 180, 180),
        rect(100, 300, 200),
        0
      )
    },
    { direction: 'below', fits: false, reservedSpace: 60 }
  );
  assert.equal(
    plan(
      rect(150, 170, 20),
      rect(0, 180, 180),
      rect(100, 360, 260),
      60
    ).reservedSpace,
    60,
    'an existing reservation must not count as natural available space'
  );
});

test('speech bubble position applies the plan while preserving horizontal geometry', () => {
  const H5P = loadConstructors(createDocument());
  const Bubble = H5P.AdvancedTextPapiJoSpeechBubble;

  function positionScenario(triggerTop, triggerBottom, bubbleHeight) {
    let reservedSpace = 0;
    const classes = new Set();
    const style = {
      setProperty(name, value) {
        this[name] = value;
      }
    };
    const bubble = Object.create(Bubble.prototype);
    bubble.root = {
      clientWidth: 400,
      getBoundingClientRect() {
        return {
          bottom: 300 + reservedSpace,
          height: 200 + reservedSpace,
          left: 25,
          top: 100,
          width: 400
        };
      }
    };
    bubble.trigger = {
      isConnected: true,
      getBoundingClientRect() {
        return {
          bottom: triggerBottom,
          height: triggerBottom - triggerTop,
          left: 175,
          top: triggerTop,
          width: 50
        };
      }
    };
    bubble.element = {
      classList: {
        toggle(name, enabled) {
          if (enabled) {
            classes.add(name);
          }
          else {
            classes.delete(name);
          }
        }
      },
      isConnected: true,
      style,
      getBoundingClientRect() {
        return {
          bottom: bubbleHeight,
          height: bubbleHeight,
          left: 0,
          top: 0,
          width: 150
        };
      }
    };
    bubble.layout = {
      getReservedSpace: () => reservedSpace,
      setReservedSpace: height => { reservedSpace = height; }
    };
    bubble.queuePosition = function () {};
    bubble.position();
    return { classes, reservedSpace, style };
  }

  const below = positionScenario(150, 170, 80);
  assert.ok(below.classes.has('papijo-runtime-speech-bubble-below'));
  assert.equal(below.style.top, '80px');
  assert.equal(below.style.left, '100px');
  assert.equal(below.reservedSpace, 0);

  const above = positionScenario(250, 270, 80);
  assert.ok(above.classes.has('papijo-runtime-speech-bubble-above'));
  assert.equal(above.style.top, '60px');
  assert.equal(above.style.left, '100px');
  assert.equal(above.reservedSpace, 0);

  const neither = positionScenario(150, 170, 180);
  assert.ok(neither.classes.has('papijo-runtime-speech-bubble-below'));
  assert.equal(neither.style.top, '80px');
  assert.equal(neither.reservedSpace, 60);
});

test('runtime reservation is in-flow, resize-aware, idempotent, and releasable', () => {
  const document = createDocument();
  document.defaultView = { document };
  document.defaultView.parent = document.defaultView;
  const H5P = loadConstructors(document);
  const root = createRoot(document);
  let resizeCount = 0;
  const runtime = new H5P.AdvancedTextPapiJoTooltipRuntime(
    root,
    1,
    [],
    () => resizeCount++
  );

  runtime.setReservedSpace(60);
  assert.equal(runtime.reservedSpace, 60);
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].className, 'papijo-runtime-tooltip-reserved-space');
  assert.equal(root.children[0].style.height, '60px');
  assert.equal(root.children[0].attributes['aria-hidden'], 'true');
  assert.equal(root.children[0].textContent, '\u200b');
  assert.equal(root.children[0].style.fontSize, '0');
  assert.equal(root.children[0].style.lineHeight, '0');
  assert.equal(resizeCount, 1);

  runtime.setReservedSpace(60);
  assert.equal(root.children.length, 1);
  assert.equal(resizeCount, 1, 'unchanged space must not accumulate or resize');

  runtime.setReservedSpace(85);
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].style.height, '85px');
  assert.equal(resizeCount, 2);

  runtime.setReservedSpace(0);
  assert.equal(root.children.length, 1);
  assert.equal(runtime.reservedSpaceElement, root.children[0]);
  assert.equal(root.children[0].style.height, '0px');
  assert.equal(resizeCount, 3);

  runtime.setReservedSpace(0);
  assert.equal(root.children.length, 1);
  assert.equal(resizeCount, 3, 'retained zero-height space must not resize again');

  runtime.releaseReservedSpace();
  assert.equal(root.children.length, 0);
  assert.equal(runtime.reservedSpaceElement, null);
  assert.equal(resizeCount, 4);
});

test('real tooltip switching and repeated cycles cannot accumulate reservations', () => {
  const document = createDocument();
  document.defaultView = { document };
  document.defaultView.parent = document.defaultView;
  const H5P = loadConstructors(document);
  const root = createRoot(document);
  root.isConnected = true;
  let resizeCount = 0;
  const runtime = new H5P.AdvancedTextPapiJoTooltipRuntime(
    root,
    1,
    [],
    () => resizeCount++
  );

  H5P.AdvancedTextPapiJoSpeechBubble = function (
    bubbleRoot,
    trigger,
    text,
    id,
    image,
    layout
  ) {
    this.root = bubbleRoot;
    this.trigger = trigger;
    this.text = text;
    this.id = id;
    this.layout = layout;
    this.contains = () => false;
    this.remove = () => { this.removed = true; };
  };

  function createState(name) {
    const attributes = {};
    return {
      bubble: null,
      bubbleId: 'bubble-' + name,
      control: {
        removeAttribute(attribute) { delete attributes[attribute]; },
        setAttribute(attribute, value) { attributes[attribute] = value; }
      },
      image: null,
      text: name,
      trigger: { contains: () => false }
    };
  }

  const stateA = createState('A');
  const stateB = createState('B');
  for (let cycle = 0; cycle < 3; cycle++) {
    runtime.open(stateA);
    runtime.setReservedSpace(20 + cycle);
    assert.equal(root.children.length, 1, 'A must own one spacer');

    runtime.open(stateB);
    runtime.setReservedSpace(30 + cycle);
    assert.equal(stateA.bubble, null, 'switch must close A');
    assert.ok(stateB.bubble, 'switch must open B');
    assert.equal(root.children.length, 1, 'switch must retain only one spacer');

    runtime.close(stateB);
    assert.equal(root.children.length, 0, 'closing B must remove the spacer');
    assert.equal(runtime.reservedSpaceElement, null);
  }

  runtime.open(stateA);
  assert.equal(root.children.length, 1, 'reopening A must create one spacer');
  runtime.close(stateA);
  assert.equal(root.children.length, 0, 'final close must remove the spacer');

  const resizeCountBeforeDestroy = resizeCount;
  runtime.destroy();
  assert.equal(runtime.reservedSpace, 0);
  assert.equal(root.children.length, 0);
  assert.equal(
    resizeCount,
    resizeCountBeforeDestroy,
    'destroy after final close must not emit a redundant resize'
  );
});

test('accessible ancestor discovery includes same-origin parents and stops safely', () => {
  const localDocument = createDocument();
  const parentDocument = createDocument();
  const topWindow = { document: parentDocument };
  topWindow.parent = topWindow;
  const localWindow = { document: localDocument, parent: topWindow };
  const H5P = loadConstructors(localDocument);
  const discover =
    H5P.AdvancedTextPapiJoTooltipRuntime.getAccessibleAncestorDocuments;

  assert.deepEqual(
    Array.from(discover(localWindow, localDocument)),
    [localDocument, parentDocument]
  );

  const blockedWindow = { document: localDocument };
  Object.defineProperty(blockedWindow, 'parent', {
    get() {
      throw new Error('cross origin');
    }
  });
  assert.deepEqual(
    Array.from(discover(blockedWindow, localDocument)),
    [localDocument]
  );
});

test('outside pointer listeners close from local and accessible parent documents', () => {
  const localDocument = createDocument();
  const parentDocument = createDocument();
  const topWindow = { document: parentDocument };
  topWindow.parent = topWindow;
  localDocument.defaultView = { document: localDocument, parent: topWindow };
  const H5P = loadConstructors(localDocument);
  const runtime = new H5P.AdvancedTextPapiJoTooltipRuntime(
    createRoot(localDocument)
  );
  let closes = 0;
  runtime.activeState = {
    bubble: { contains: () => false },
    trigger: { contains: () => false }
  };
  runtime.close = function () {
    closes++;
    this.activeState = null;
    this.removeOutsidePointerListener();
  };
  runtime.addOutsidePointerListener();
  parentDocument.dispatch('pointerdown', {});
  assert.equal(closes, 1);
  assert.equal((localDocument.listeners.pointerdown || []).length, 0);
  assert.equal((parentDocument.listeners.pointerdown || []).length, 0);

  runtime.activeState = {
    bubble: { contains: () => false },
    trigger: { contains: target => target.inside === true }
  };
  runtime.addOutsidePointerListener();
  localDocument.dispatch('pointerdown', { inside: true });
  assert.equal(closes, 1, 'local pointer inside the trigger must stay open');
  localDocument.dispatch('pointerdown', {});
  assert.equal(closes, 2);
});

test('AdvancedText propagates reservation changes with its normal resize event', () => {
  const events = [];
  let runtimeArguments;
  function EventDispatcher() {}
  EventDispatcher.prototype.trigger = function (event) {
    events.push(event);
  };
  function Runtime() {
    runtimeArguments = Array.from(arguments);
    this.root = arguments[0];
  }
  Runtime.prototype.initialize = function () { return 1; };
  Runtime.prototype.destroy = function () {};
  const H5P = {
    AdvancedTextPapiJoTooltipRuntime: Runtime,
    EventDispatcher,
    jQuery() {}
  };
  vm.runInNewContext(textSource, { H5P });
  const element = {};
  const container = {
    0: element,
    addClass() { return this; },
    html() { return this; }
  };
  new H5P.AdvancedTextPapiJo({ text: 'Text' }, 7).attach(container);

  assert.equal(runtimeArguments[0], element);
  assert.equal(runtimeArguments[1], 7);
  runtimeArguments[3]();
  assert.deepEqual(events, ['resize']);
});
