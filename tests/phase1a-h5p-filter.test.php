<?php

declare(strict_types=1);

$installed = rtrim(getenv('PAPIJO_PHP_ROOT') ?: 'C:/my_first_h5p_environment/libraries/', '/\\') . '/';
require_once $installed . 'h5p-php-library/h5p.classes.php';

final class Phase1AFrameworkStub {
  public function setErrorMessage($message, $code = null): void {}

  public function t($message, $replacements = array()): string {
    return strtr($message, $replacements);
  }
}

function assertSameValue(string $expected, string $actual, string $case): void {
  if ($expected !== $actual) {
    fwrite(STDERR, $case . " failed.\nExpected: " . $expected . "\nActual:   " . $actual . "\n");
    exit(1);
  }
}

$semantics = (object) array(
  'type' => 'text',
  'tags' => array('p', 'span', 'strong'),
);
$validator = new H5PContentValidator(new Phase1AFrameworkStub(), null);

$tooltip = '<p>This is a <span class="papijo-tooltip" data-papijo-tooltip="Explanation">selected phrase</span> inside Advanced Text.</p>';
$validator->validateText($tooltip, $semantics);
assertSameValue(
  '<p>This is a <span class="papijo-tooltip" data-papijo-tooltip="Explanation">selected phrase</span> inside Advanced Text.</p>',
  $tooltip,
  'Tooltip metadata'
);

$imageTooltip = '<p><span class="papijo-tooltip" data-papijo-tooltip="Caption" data-papijo-tooltip-id="tip-image-1">selected phrase</span></p>';
$validator->validateText($imageTooltip, $semantics);
assertSameValue(
  '<p><span class="papijo-tooltip" data-papijo-tooltip="Caption" data-papijo-tooltip-id="tip-image-1">selected phrase</span></p>',
  $imageTooltip,
  'Tooltip image identifier metadata'
);

$formatted = '<p><span class="papijo-tooltip" data-papijo-tooltip="Explanation">selected <strong>formatted</strong> phrase</span></p>';
$validator->validateText($formatted, $semantics);
assertSameValue(
  '<p><span class="papijo-tooltip" data-papijo-tooltip="Explanation">selected <strong>formatted</strong> phrase</span></p>',
  $formatted,
  'Formatted tooltip selection'
);

$formattedMetadata = '<p><span class="papijo-tooltip" data-papijo-tooltip="A &lt;strong&gt;very important&lt;/strong&gt; term">selected phrase</span></p>';
$validator->validateText($formattedMetadata, $semantics);
assertSameValue(
  '<p><span class="papijo-tooltip" data-papijo-tooltip="A &lt;strong&gt;very important&lt;/strong&gt; term">selected phrase</span></p>',
  $formattedMetadata,
  'Formatted tooltip metadata'
);

$ordinary = '<p>Ordinary <strong>Advanced Text</strong> content.</p>';
$validator->validateText($ordinary, $semantics);
assertSameValue(
  '<p>Ordinary <strong>Advanced Text</strong> content.</p>',
  $ordinary,
  'Ordinary content'
);

echo "H5P FILTER PASS\n";

// Use the actual AdvancedText field: no arbitrary img tag is permitted.
$inlineSemantics = json_decode(file_get_contents(__DIR__ . '/../semantics.json'))[0];
$managedInline = '<p>Before <span class="papijo-inline-image" data-papijo-inline-image-id="inline-1"></span> after</p>';
$expectedInline = $managedInline;
$validator->validateText($managedInline, $inlineSemantics);
assertSameValue($expectedInline, $managedInline, 'Managed inline marker survives actual semantics');
$unmanagedInline = '<p>Before <img src="https://example.com/image.png" alt="Remote"> after</p>';
$validator->validateText($unmanagedInline, $inlineSemantics);
assertSameValue('<p>Before  after</p>', $unmanagedInline, 'Unmanaged remote image is removed');
echo "INLINE IMAGE FILTER PASS\n";

// PHP preserves data attributes; the shared editor/runtime enum enforces values.
foreach (array('alignLeft', 'alignRight', 'unsupported') as $presentation) {
  $styled = '<p><span class="papijo-inline-image" data-papijo-inline-image-id="inline-1" data-papijo-inline-image-style="' . $presentation . '"></span></p>';
  $expected = $styled;
  $validator->validateText($styled, $inlineSemantics);
  assertSameValue($expected, $styled, 'Occurrence presentation survives PHP filtering: ' . $presentation);
}
echo "INLINE IMAGE PRESENTATION FILTER PASS\n";

// PHP keeps supported occurrence URLs and strips disallowed scheme prefixes.
// The remaining value must still pass the stricter shared editor/runtime policy.
foreach (array('https://example.com/details?q=1&amp;b=2#photo', 'http://example.com/photo', 'javascript:x') as $href) {
  $linked = '<p><span class="papijo-inline-image" data-papijo-inline-image-id="inline-1" data-papijo-inline-image-style="alignLeft" data-papijo-inline-image-link="' . $href . '"></span></p>';
  $expected = $href === 'javascript:x' ? str_replace('javascript:x', 'x', $linked) : $linked;
  $validator->validateText($linked, $inlineSemantics);
  assertSameValue($expected, $linked, 'PHP preserves link data for shared boundary validation');
}
echo "INLINE IMAGE LINK FILTER PASS\n";

// Both actual PHP validators preserve data; numeric validation belongs to the
// independently packaged shared contract, not PHP's protocol filtering.
foreach (array('0.1', '30', '55.5', '100', '0', '-1', '101', 'NaN', 'Infinity', '1e1', 'calc(50%)') as $width) {
  $sized = '<p><span class="papijo-inline-image" data-papijo-inline-image-id="inline-1" data-papijo-inline-image-width="' . $width . '"></span></p>';
  $expected = $sized;
  $validator->validateText($sized, $inlineSemantics);
  assertSameValue($expected, $sized, 'PHP width preservation before strict shared validation');
}
echo "INLINE IMAGE WIDTH FILTER PASS\n";

// Controlled child text bypasses data-attribute protocol rewriting, including colons.
foreach (array('Rabbit: garden', 'Quotes &quot; and apostrophe&#39;', 'Ampersand &amp; literal &lt;b&gt;text&lt;/b&gt;',
  'Été français', '🐇👩‍👩‍👧‍👦', 'Two  internal   spaces', 'French space !', 'https://example.org/path', 'é') as $caption) {
  $captioned = '<p><span class="papijo-inline-image" data-papijo-inline-image-id="inline-1" data-papijo-inline-image-width="0.1">' .
    '<span class="papijo-image-caption">' . $caption . '</span></span></p>';
  $expected = $captioned;
  $validator->validateText($captioned, $inlineSemantics);
  assertSameValue($expected, $captioned, 'Controlled caption text survives PHP filtering');
}
echo "INLINE IMAGE CAPTION FILTER PASS\n";

// Exercise PHP's actual recursive list/group/image dispatch without file writes.
$fileCore = (object) array('relativePathRegExp' => '/^$never-match/');
$fileValidator = new H5PContentValidator(new Phase1AFrameworkStub(), $fileCore);
$inlineStore = array((object) array(
  'id' => 'inline-1',
  'image' => (object) array(
    'path' => 'images/photo.png#tmp', 'mime' => 'image/png', 'width' => 640, 'height' => 480,
    'unexpected' => 'removed',
  ),
  'alt' => 'A photograph',
));
$allSemantics = json_decode(file_get_contents(__DIR__ . '/../semantics.json'));
$revisedDefinition = json_decode(json_encode($inlineStore[0]));
$revisedDefinition->id = 'inline-alt-revision';
$revisedDefinition->alt = 'Updated photograph';
$inlineStore[] = $revisedDefinition;
$fileValidator->validateList($inlineStore, $allSemantics[2]);
assertSameValue('inline-1', $inlineStore[0]->id, 'Stable inline ID survives recursive semantic validation');
assertSameValue('images/photo.png', $inlineStore[0]->image->path, 'Image semantic strips temporary suffix');
assertSameValue('A photograph', $inlineStore[0]->alt, 'Image alternative text survives semantic validation');
assertSameValue('image/png', $inlineStore[0]->image->mime, 'Standard H5P image metadata survives');
assertSameValue('no', isset($inlineStore[0]->image->unexpected) ? 'yes' : 'no', 'Image metadata is filtered by H5P');
assertSameValue('2', (string) count($inlineStore), 'Both retained alt history definitions survive');
assertSameValue($inlineStore[0]->image->path, $inlineStore[1]->image->path, 'Retained alt revisions share the same managed file');
assertSameValue('Updated photograph', $inlineStore[1]->alt, 'Revised alternative text survives');
echo "INLINE IMAGE SEMANTIC FILE PASS\n";
