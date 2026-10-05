'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const semantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
const french = JSON.parse(fs.readFileSync(path.join(root, 'language', 'fr.json'), 'utf8'));

// H5P traverses translations positionally, including list.field and group.fields.
function assertTranslationFields(fields, translations, location = 'semantics') {
  assert.ok(Array.isArray(translations), `${location}: expected a translation array`);
  assert.equal(translations.length, fields.length, `${location}: field count differs`);

  fields.forEach((field, index) => {
    const translation = translations[index];
    const fieldPath = `${location}[${index}] (${field.name})`;
    assert.ok(translation && typeof translation === 'object' && !Array.isArray(translation),
      `${fieldPath}: expected a translation object`);

    if (field.label !== undefined) {
      assert.equal(typeof translation.label, 'string', `${fieldPath}: missing label`);
      assert.ok(translation.label.trim().length > 0, `${fieldPath}: empty label`);
    }

    if (field.field !== undefined) {
      assertTranslationFields([field.field], [translation.field], `${fieldPath}.field`);
    }
    else {
      assert.equal(translation.field, undefined, `${fieldPath}: unexpected list field`);
    }

    if (field.fields !== undefined) {
      assertTranslationFields(field.fields, translation.fields, `${fieldPath}.fields`);
    }
    else {
      assert.equal(translation.fields, undefined, `${fieldPath}: unexpected group fields`);
    }
  });
}

test('root language policy retains only French; English comes from canonical semantics', () => {
  assert.deepEqual(fs.readdirSync(path.join(root, 'language')).sort(), ['fr.json']);
  assert.equal(semantics[0].label, 'Text');
  assert.equal(semantics[1].label, 'Tooltip images');
  assert.equal(semantics[1].field.label, 'Tooltip image');
  assert.deepEqual(semantics[1].field.fields.map((field) => field.label),
    ['Identifier', 'Image', 'Alternative text']);
});

test('French translations cover every canonical field, list item, and nested group position', () => {
  assertTranslationFields(semantics, french.semantics);
  assert.equal(french.semantics[0].label, 'Texte');
  assert.equal(french.semantics[1].label, 'Images des infobulles');
  assert.equal(french.semantics[1].field.label, 'Image de l’infobulle');
  assert.deepEqual(french.semantics[1].field.fields.map((field) => field.label),
    ['Identifiant', 'Image', 'Texte alternatif']);
});

test('structural validation rejects missing root and nested translations', () => {
  const cases = [
    ['missing tooltipImages', (translation) => translation.pop(), /field count differs/],
    ['missing tooltipImage', (translation) => delete translation[1].field,
      /tooltipImage.*expected a translation object/],
    ['missing group fields', (translation) => delete translation[1].field.fields,
      /expected a translation array/],
    ['missing alt', (translation) => translation[1].field.fields.pop(), /field count differs/],
    ['missing image in place', (translation) => { translation[1].field.fields[1] = null; },
      /image.*expected a translation object/],
    ['missing nested label', (translation) => delete translation[1].field.fields[2].label,
      /alt.*missing label/]
  ];

  cases.forEach(([name, mutate, expectedError]) => {
    const translation = structuredClone(french.semantics);
    mutate(translation);
    assert.throws(() => assertTranslationFields(semantics, translation), expectedError, name);
  });

  const extendedSemantics = structuredClone(semantics);
  extendedSemantics[1].field.fields.push({ name: 'caption', type: 'text', label: 'Caption' });
  assert.throws(() => assertTranslationFields(extendedSemantics, french.semantics),
    /field count differs/, 'future nested semantics addition must require a translation');
});
