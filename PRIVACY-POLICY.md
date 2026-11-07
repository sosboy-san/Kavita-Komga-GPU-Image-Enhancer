# GPUIE プライバシーポリシー / Privacy Policy

最終更新日 / Last updated: 2026-11-07

## 日本語

Kavita & Komga GPU Image Enhancer（GPUIE）は、登録されたKavitaまたはKomgaの読書ページで画像処理と表示調整を提供する拡張機能です。

### 取り扱う情報

GPUIEは、登録されたサーバーのアドレスや読書ページのURLを、対象サイトの識別と機能の提供に使用します。読書ページの画像を取得し、選択した設定に従ってブラウザー内で処理します。サイト登録、表示・画像処理の設定、取り込んだモジュールは、ブラウザーの拡張機能ストレージに保存されます。

開発者モードでは、画像サイズ、ページ番号、処理時間、モジュール名、設定値、エラーなどの診断情報を表示できます。診断記録は読書ページ内のメモリーで管理されます。GPUIE本体には、これらの診断情報を開発者へ自動送信する機能はありません。

### 接続先と追加モジュール

GPUIEは、ユーザーが登録しアクセスを許可したKavitaまたはKomgaのサーバーと通信して画像などを取得します。機能に必要な同一サイトへのリクエストには、ブラウザーの認証情報が使われる場合があります。サーバーの運営者によるデータの取り扱いは、その運営者の方針に従います。

ユーザーは追加のGPUレンダラーやフィルターのファイルを取り込めます。モジュールには実行可能なコードが含まれます。形式の検査は、モジュールのすべての動作や通信先の安全性を保証するものではありません。信頼できる提供元のものを使用してください。

Workerモードでは、選択されたモジュールをSandbox内のWorkerで評価・実行します。速度優先モードでは、選択された外部モジュールをUser Scripts API経由で読書ページのMAINコンテキストに登録・実行します。モジュールはコードと実行環境に応じて、ページ情報にアクセスしたり通信を試みたりする可能性があります。追加モジュールのデータの取り扱いは、そのコードと提供元によって異なります。

### データの利用と共有

GPUIE本体は、画像処理と表示調整の提供に必要な範囲で情報を使用します。ユーザーが指定したサーバーとの通信が発生します。追加モジュールの通信先はモジュールによって異なる場合があります。GPUIE本体は、診断情報を開発者に自動送信しません。

GPUIEによるユーザーデータの使用は、Chromeウェブストアのユーザーデータポリシー（Limited Use要件を含む）に従います。開発者はユーザーデータを広告目的で販売・利用せず、信用力の判断や融資の目的で使用・転送しません。

### 削除とお問い合わせ

登録サイト、設定、追加モジュールは拡張機能の設定画面から変更または削除できます。拡張機能をアンインストールすると、ブラウザーが管理する拡張機能のローカルデータは削除されます。接続先サーバーや追加モジュールの提供元が保持するデータには、それぞれの管理方法が適用されます。

お問い合わせ: https://github.com/sosboy-san/Kavita-Komga-GPU-Image-Enhancer/issues

## English

Kavita & Komga GPU Image Enhancer (GPUIE) provides image processing and display controls on reader pages of registered Kavita or Komga servers.

### Information handled

GPUIE uses registered server addresses and reader page URLs to identify the target site and provide its features. It obtains reader images and processes them in the browser according to the selected settings. Registered sites, display and image-processing settings, and imported modules are saved in browser extension storage.

Developer mode can display diagnostic information such as image dimensions, page numbers, processing times, module names, settings, and errors. Diagnostic records are kept in memory within the reader page. GPUIE itself does not automatically send these diagnostics to the developer.

### Server connections and imported modules

GPUIE communicates with Kavita or Komga servers registered and authorized by the user to obtain images and other resources. Where needed, same-site requests may use the browser's authentication credentials. The server operator's own data practices apply to that server.

Users can import additional GPU renderer and filter files. Modules contain executable code. Format validation does not guarantee that all behavior or network destinations are safe. Import modules only from sources you trust.

In Worker mode, selected modules are evaluated and executed in a sandboxed Worker. In speed-priority mode, selected external modules are registered and executed in the reader page's MAIN context using the User Scripts API. Depending on its code and execution environment, a module may access page information or attempt network communication. Imported modules' data practices depend on their code and providers.

### Use and sharing

GPUIE itself uses information as needed to provide image processing and display controls. It communicates with servers specified by the user. Network destinations used by imported modules may vary. GPUIE itself does not automatically transmit diagnostics to the developer.

GPUIE's use of user data complies with the Chrome Web Store User Data Policy, including its Limited Use requirements. The developer does not sell or use user data for advertising, or use or transfer it to determine creditworthiness or for lending purposes.

### Deletion and contact

Registered sites, settings, and imported modules can be changed or removed in the extension's settings. Uninstalling the extension removes its browser-managed local extension data. Data retained by a server or module provider is subject to that party's own practices.

Contact: https://github.com/sosboy-san/Kavita-Komga-GPU-Image-Enhancer/issues

