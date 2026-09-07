<?php

declare(strict_types=1);

require_once 'C:\my_first_h5p_environment\libraries\h5p-php-library\h5p.classes.php';

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
