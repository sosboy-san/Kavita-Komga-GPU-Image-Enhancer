# Build your first filter

[日本語](Module-Quickstart-ja.md) | [English](Module-Quickstart-en.md)

This guide assumes basic JavaScript and GLSL knowledge. With GPUIE 0.9.5 beta and public module API 1.0, you will load a brightness filter, see its effect, change its code, and install an updated version.

GPUIE handles image loading, display, adjustment UI generation, and setting storage. This example needs no build step or npm packages.

## 1. Save the example

Open [Brightness-Filter-1.0.0.js](../examples/Brightness-Filter-1.0.0.js), then save the JavaScript using GitHub's **Raw** view. Do not save the GitHub HTML page. The Source ZIP contains the same file under `examples/`.

If you have not installed GPUIE and registered your site, follow [first-time setup](../README.en.md#first-time-setup). Allow GPUIE to run user scripts in the browser's extension settings.

## 2. Load it and see the effect

1. In detailed settings, open **Image processing → Post-filter**.
2. Choose **Load package…** and select the saved `.js` file.
3. In **Edit selection**, check **Brightness Example** and confirm with **OK**.
4. Return to the reader. Press the post-filter quick icon until **Brightness Example** is selected. Each press cycles through OFF and the selected modules.
5. Open **Adjust**, set Brightness to **0.2**, and apply it. The image becomes slightly brighter. Try **-0.2** to darken it, or **0** for no change.

For an easy comparison, leave the pre-filter OFF and use this example only as a post-filter. Filters also run with the Browser renderer and at a 1:1 image scale.

This learning example adds an offset to sRGB components. It is not exposure correction or paper restoration; strong settings clip highlights or shadows.

## 3. Find your way around the code

| Part | Role |
| --- | --- |
| `parameters` | Slider range and default; GPUIE generates the UI and saves values |
| `translations` | English and Japanese names, instructions, and labels; English is required |
| `prepare()` | Create the GPU program |
| `execute()` | Receive saved settings and draw the entire output image |
| `dispose()` | Release the GPU program |

This GLSL line changes RGB while preserving alpha:

```glsl
outColor = vec4(clamp(color.rgb + brightness * 0.5, 0.0, 1.0), color.a);
```

## 4. Edit and install an updated version

You cannot register the same `id` and `version` twice. Renaming the file alone does not update a module.

1. Copy the saved file to `Brightness-Filter-1.0.1.js`.
2. Remove `* 0.5` from the GLSL line:

   ```glsl
   outColor = vec4(clamp(color.rgb + brightness, 0.0, 1.0), color.a);
   ```

3. Change these two descriptor fields. Keep `id: 'example.brightness'` unchanged.

   ```js
   version: '1.0.1',
   implementationRevision: 'brightness-2',
   ```

4. Import the edited file using **Load package…** in the same post-filter settings. In the add/update dialog, select version 1.0.0 as the replacement target, then press **Update**.
5. **Reload the reading page**, select the example, and apply Brightness **0.2**. A stronger brightening effect at the same setting confirms the code change.

Updates retain compatible settings and quick-control selections. Changing a parameter's default does not replace a saved value. Keep parameter names, types, and ranges unchanged for this exercise.

To compare versions, choose **Add** instead of Update. This keeps the old version and installs the new one alongside it. Add both versions to the quick-control selection to compare them. When starting a separate module, give it your own unique `id`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| ID and version already installed | Increase `version`; also change `implementationRevision` when changing the implementation |
| Imports but does not run | User-script permission, site registration, extension ON, and example selected |
| No visible change | Brightness is not zero and the changed value has been applied |
| Old behavior after update | Reload the reading page; check the selected version and the saved file |
| Import or rendering error | Read the displayed error. Enable Developer mode under developer/diagnostic settings and inspect the current-image diagnostics |

Next, see sections 4 (adjustment UI), 5–6 (images and GPU host), 7 (CPU analysis), and 11 (diagnostics) of the [API reference, in Japanese](../GPU-Module-API-Spec-ja-1.0.md). The [distributed modules](../reference-packages/) provide larger implementation examples.

The example is MIT-licensed. I use ChatGPT / Codex by OpenAI for design, implementation, testing, and documentation.
