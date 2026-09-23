# Changelog

## 1.2.3

- Fixed unreadable text in the Dark theme when AdvancedTextPapiJo is embedded inside ColumnPapiJo or InteractiveBookPapiJo.
- Applied the theme's primary text color to embedded AdvancedTextPapiJo content while preserving standalone appearance and authored formatting.

## 1.2.2

- Enlarged the Tooltip text authoring field, made it vertically resizable, and clarified that text is optional when an image is used.
- Showed Image alternative text only while a tooltip image exists and cleared it when the image is replaced with a different image.
- Streamlined Edit mode to Update tooltip | Cancel | Remove tooltip and improved guidance when both tooltip text and image are removed.
- Removed the unnecessary tooltip-image Edit image and Edit copyright controls.

## 1.2.1

- Fixed image tooltips being vertically clipped when there is insufficient space.
- Added flip-above placement and temporary in-flow space reservation when neither side fits.
- Propagated H5P resize events when tooltip layout space changes.
- Improved cleanup and outside-click handling across accessible parent documents.

## 1.2.0

- Added H5P-managed images to AdvancedTextPapiJo tooltips.
- Added support for text-only, image-only, and text-plus-image tooltips.
- Added image alternative text and image replace/remove authoring.
- Added managed image support in nested/compound H5P content.
- Added responsive image sizing and bubble repositioning after image load.
- Preserved existing tooltip sanitization and backward compatibility.
- Added regression coverage for image lifecycle, nested content, and asynchronous image-widget callbacks.

## 1.1.16

- Added authoring-only commands to sort the current table column A → Z or Z → A.
- Reorders only cell contents in the selected column; other columns and header rows remain unchanged.
- Preserves formatting and PapiJo tooltip data, places empty values last, and supports undo/redo.

## 1.1.15

- Changed the display title from "Text Papi Jo" to "Advanced Text Papi Jo".
- Updated the library description to reflect rich text and author-defined tooltip support.
- No runtime, editor, storage, dependency, or content-format behavior changed.

## 1.1.14

- Added selection-based tooltip creation, editing, and removal to the Advanced Text editor, with English and French editor interfaces.
- Implemented tooltip authoring through the CKEditor model to preserve formatted and table-cell content, selection state, and undo/redo behavior.
- Added accessible runtime tooltip display with keyboard and pointer interaction.
- Added restricted inline tooltip formatting using `em`, `strong`, `sup`, `sub`, `s`, and `br`. Editor and runtime sanitizers remove all attributes, unwrap non-executable unsupported elements, and discard executable or embedded content.
- Added compatibility and lifecycle coverage for Advanced Text used inside H5P.AccordionPapiJo.
- Made Advanced Text runtime initialization robust when parameters or the text field are missing or empty.

Known limitation: H5P.NDLATimelinePapiJo does not support runtime tooltips because it currently renders Advanced Text descriptions directly instead of instantiating the Advanced Text child library. This is a limitation of that parent integration, not an H5P.AdvancedTextPapiJo runtime defect.
