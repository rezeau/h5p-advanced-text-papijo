# Changelog

## 1.1.14

- Added selection-based tooltip creation, editing, and removal to the Advanced Text editor, with English and French editor interfaces.
- Implemented tooltip authoring through the CKEditor model to preserve formatted and table-cell content, selection state, and undo/redo behavior.
- Added accessible runtime tooltip display with keyboard and pointer interaction.
- Added restricted inline tooltip formatting using `em`, `strong`, `sup`, `sub`, `s`, and `br`. Editor and runtime sanitizers remove all attributes, unwrap non-executable unsupported elements, and discard executable or embedded content.
- Added compatibility and lifecycle coverage for Advanced Text used inside H5P.AccordionPapiJo.
- Made Advanced Text runtime initialization robust when parameters or the text field are missing or empty.

Known limitation: H5P.NDLATimelinePapiJo does not support runtime tooltips because it currently renders Advanced Text descriptions directly instead of instantiating the Advanced Text child library. This is a limitation of that parent integration, not an H5P.AdvancedTextPapiJo runtime defect.
