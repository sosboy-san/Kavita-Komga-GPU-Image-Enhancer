# Third-party notices / 第三者クレジット

GPUIE development, adaptation, modifications and maintenance: **sosboy-san**.

GPUIEの開発・移植・改修・保守はsosboy-sanが担当します。原作者表記は、原作者によるGPUIEの公式版・推奨・サポートを示すものではありません。不具合は[GPUIE公式リポジトリ](https://github.com/sosboy-san/Kavita-Komga-GPU-Image-Enhancer)へ報告してください。

Original-author credits do not imply an official GPUIE release, endorsement or support by those authors. Report GPUIE issues to the GPUIE project, not the upstream projects.

## Crisp Images — MIT

Original project: https://github.com/Ikkoru/crisp-images

Original author: **Ikkoru**, previously credited as **Igkor Bevzenidis**.

本体の画像状態管理・キャッシュ・診断基盤と、別配布のLanczos3にはCrisp Images由来コードが残ります。GPUIEのサイト連携・拡張機能化・API適応などは追加の改修です。本体全体を原作者による実装として扱うものではありません。

Crisp Images-derived code remains in the reader core's image state, cache and diagnostic infrastructure and the separate Lanczos3 renderer. GPUIE adds site integration, extension controls, module APIs and other modifications. This identifies known provenance rather than assigning every line to the original project.

取得時のMIT文書はextension/licenses/Lanczos3-MIT.txtにそのまま残しています。著作権名は旧表記です。上流は2026-10-10にLICENSE・README・スクリプトの作者表記を変更しました。

https://github.com/Ikkoru/crisp-images/commit/7cb7e4b1fdc60225c3fb20311bd9e0386638dcbf

The acquired MIT notice is preserved, including its historical copyright name. The separate module pack includes the same notice as Crisp-Images-MIT.txt.

## GEGL — LGPL-3.0-or-later

Original project: https://gitlab.gnome.org/GNOME/gegl

LoHalo Jr.・NoHalo Jr.はGPUIE向けに適応した実装で、完全互換の移植版ではありません。GEGL由来部分のLGPL-3.0-or-laterを維持します。ソースにあるCrisp Images由来MIT部分の注記も維持し、補助部分の範囲はファイル整理時に確認します。

LoHalo Jr. and NoHalo Jr. are adapted implementations, not fully compatible ports. Their GEGL-derived portions retain LGPL-3.0-or-later. Existing source notices for auxiliary Crisp Images-derived MIT portions are also retained; their precise scope needs checking when restructuring the files.

### LoHalo

Source: https://github.com/GNOME/gegl/blob/master/gegl/buffer/gegl-sampler-lohalo.c

Upstream header: **2012, 2017 (c) Nicolas Robidoux**.

### NoHalo

Source: https://github.com/GNOME/gegl/blob/master/gegl/buffer/gegl-sampler-nohalo.c

Upstream header:

- **2012 (c) Nicolas Robidoux**
- **2009–2011 (c) Nicolas Robidoux, Adam Turcotte, Chantal Racette, Anthony Thyssen, John Cupitt and Øyvind Kolås**
- **2018 Øyvind Kolås**

GNU LGPL 3 and GNU GPL 3 copies: extension/licenses/LGPL-3.0.txt and extension/licenses/GPL-3.0.txt.

## Independently authored filters — MIT

GPU Unsharp Mask, Paper Restoration and Monochrome Line Color:

**Copyright (c) 2026 sosboy-san. MIT License.**

See extension/licenses/GPUIE-Filters-MIT.txt. The separate module pack also includes GPUIE-Filters-MIT.txt.

このMIT指定は上記3フィルターが対象です。第三者由来コードの条件は置き換えません。独立した本体新規部分・README・API文書・紹介ページもMITです。第三者の画像素材はこの指定に含めません。

This declaration applies to these three filters. It does not replace third-party licenses. Independently authored core code, README, API documentation and the introduction page are also MIT-licensed. Third-party image assets are excluded.
