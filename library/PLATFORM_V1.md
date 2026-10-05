# Shadow Library Platform V1

V1 在现有静态书房上扩展，不引入账户、付款或投稿后台。

## 平台与出版身份

`data/platform.json` 保存平台 ID、名称、版本、品牌和入口。平台名称不等于各书的出版者：不能将其他渠道的出版社或 ISBN 自动套用到网页阅读版。

`data/books.json` 仍是数组，原字段、书籍 ID、章节路径、目录、状态和 `edition` 技术版本均保留。新增 `publication` 对象；缺少它的旧记录仍可阅读。书架数量与已完成数量自动统计。

| 字段 | 含义及填写原则 |
| --- | --- |
| metadataVersion | 出版 metadata 结构版本，目前为 1 |
| publisher / imprint | 当前网页版本出版者 / 出版品牌；待核实为 null，不据平台名称推定法律实体 |
| language | BCP 47 语言标签；当前为 zh-CN，更多语言使用各自标签 |
| format | 当前平台版本格式；已上线为 web，尚未收录为 null |
| isbn | 当前版本的已核实 ISBN-13（无连字符）；未知为 null，不代表没有 ISBN |
| edition | 正式出版版次；未知为 null，与旧的技术 edition 字段分开 |
| contributors | [{name, role}]，可增加其他作者、译者、编者；原 author 继续控制现有署名显示 |
| rights | holder、license、statement、platformPermission、exclusive；未知均为 null |
| externalEditions | [{channel, label, url, title, ...}]，一个作品可有多个发行入口 |

外部版本可以单独补充 publisher、imprint、isbn、language、format、edition、rights，字段语义同上。纸书、EPUB 和网页版本分别记录；不要复制未核实的 ISBN、版次或授权范围。

rights.exclusive 是“该版本对本平台的授权是否独家”，只接受 true、false 或 null。平台收录本身不声明版权转让或独家授权。文字、图片等第三方素材的授权不能由作者身份推定。现有版权页和内容保持原样；新增字段留空不覆盖原书声明。

## 增加作品

1. 在 books.json 追加记录；使用稳定且唯一的 id，并填写 title、author、cover、status（coming/sample/complete）。ID 参与阅读 URL 和本机进度键，上线后不改名。
2. 按 `data/publication.schema.json` 填写 publication。未知用 null / 空数组，不使用示例 ISBN。其他作者可以有不同出版者、品牌和权利范围。
3. 待收录作品保持 coming；开放阅读前提供 chapters、toc 和可用的章节文件。保持原书署名、授权及内容核验流程。
4. 发行入口加入 externalEditions；channel 使用稳定机器名称（如 apple-books / weread），label 为显示名称，url 为完整 HTTP(S) 地址。只有真实确认的版本才填写 title。Apple Books 仍出现在原位置；其他渠道位于详情页。
5. V1 保留 appleBooksUrl / appleBooksTitle 作为旧接口；如更新已有 Apple 入口，同步更新结构化记录。旧入口仅在无结构化 Apple 入口时回退使用。
6. 运行 `node --test scripts/library-platform.test.cjs scripts/analytics.test.cjs`，并验证新书详情、目录、手机阅读及恢复进度。

## 本次基线与验证

基于 main `9071e992eab60cf85d871a89258a948c40fe0329`。

保留三本 complete、两本 coming，以及全部原字段。`reader.js`、`storage.js`、CSS、统计代码、正文、图像和首页入口均不修改。未知 ISBN 不从近期注册记录猜测映射到任何网页版。此次 V1 不改变其他纸质或数字渠道的合作条款。

验证结果：五本书的全部旧字段逐项对比一致；4 项平台兼容性测试及 8 项统计测试通过；JavaScript 语法与 diff 空白检查通过。手机和桌面实际渲染未验证：Playwright 浏览器下载返回无效 ZIP，无法启动浏览器。合并上线前仍需视觉检查。
