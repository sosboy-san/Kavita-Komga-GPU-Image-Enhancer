# GPUIE public module pack 1.0.1

Public API / 対応公開API：1.0

| Module | Version | License |
| --- | --- | --- |
| GPU Unsharp Mask | 1.0.1 | MIT — sosboy-san |
| Paper Restoration | 1.0.0 | MIT — sosboy-san |
| Monochrome Line Color | 1.0.0 | MIT — sosboy-san |
| Lanczos3 | 1.0.0 | MIT — Crisp Images-derived code |

Extract this ZIP and import the .txt files individually from the renderer/filter package import controls in GPUIE detailed settings. Enable user scripts for GPUIE in the browser's extension settings. Do not import this README or license texts as modules. The development build installs the three filters once with processing initially OFF for each filter. Filters can be deleted; importing their official files restores them. Lanczos3 remains an optional renderer. User-selected custom code requires user-script access; exact copies of packaged official filters use the packaged execution path.

ZIPを展開し、必要な.txtを詳細設定のレンダラー／フィルターパッケージ読み込みから個別に追加します。ブラウザー側でGPUIEのユーザースクリプト実行を許可してください。このREADMEとライセンス文書はモジュールとして読み込まないでください。この開発版ではUSM・紙地復元・線色／濃度調整の3フィルターを、処理はOFFのまま初回登録します。削除後は公式ファイルを読み込んで戻せます。Lanczos3は任意の追加レンダラーです。独自に追加したコードの実行にはユーザースクリプトの許可が必要です。同梱公式フィルターと完全一致するファイルは、同梱コードとして扱います。

GPUIE adaptation and maintenance / GPUIE向け移植・保守：sosboy-san

Crisp Images original author / 原作者：Ikkoru（旧表記 / previously credited as Igkor Bevzenidis）

Original-author credits do not imply endorsement or support of GPUIE. Report GPUIE issues to https://github.com/sosboy-san/Kavita-Komga-GPU-Image-Enhancer .

原作者表記はGPUIEへの推奨・サポートを示しません。不具合はGPUIE側へ報告してください。

See GPUIE-Filters-MIT.txt and Crisp-Images-MIT.txt for the license texts. Image classification and paper estimation are not infallible; see each module's Info for usage and limitations.
