音乐播放器素材放置说明（music-player.html）

请将以下文件上传到 /music/ 目录：

1) 封面图
   - cover-adelaide.jpg
   - 建议尺寸：至少 1200x1200，正方形更佳

2) 音频文件
   - song1.mp3
   - song2.mp3
   - song3.mp3

默认对应关系（可在 music-player.html 的 songs 数组中修改）：
- song1.mp3 -> 阿德莱德，一个我称之为家的地方
- song2.mp3 -> 跨越万水千山
- song3.mp3 -> 南半球的天空

如果你想给每首歌使用不同封面：
- 继续把图片放在 /music/，例如：cover-song2.jpg, cover-song3.jpg
- 打开 music-player.html
- 在 songs 数组里分别修改每首歌的 cover 字段
