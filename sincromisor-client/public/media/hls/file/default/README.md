ここにVRM360用の動画ファイル(HLS形式)を置きます。
アクセスする際のURLを `https://localhost/vrm360/?video_id=file/sample` とすると、
`sincromisor-client/public/media/hls/file/sample/index.m3u8` が参照されます。

video_idの形式はfile/VIDEONAMEまたはlive/VIDEONAME。利用できる文字列はa-zA-Z0-9_/で、最大64文字です。
movie.jsonは[Light360](https://github.com/Sincromisor/Light360)で生成できます(Optional)。

- sincromisor-client/public/media/hls/file/VIDEONAME/index.m3u8
- sincromisor-client/public/media/hls/file/VIDEONAME/movie.json
- sincromisor-client/public/media/hls/file/VIDEONAME/segment0000.ts
- sincromisor-client/public/media/hls/file/VIDEONAME/segment0001.ts

## H.264 -> HLS変換の例

```sh
#!/bin/bash

VIDEO_NAME=sample01
SOURCE_VIDEO="${VIDEO_NAME}.mp4"
EXPORT_DIR=videos/${VIDEO_NAME}

mkdir -p "${EXPORT_DIR}"
ffmpeg -i "${SOURCE_VIDEO}" -c:v copy -c:a aac -ac 2 \
    -f hls \
    -hls_playlist_type vod \
    -hls_time 1 \
    -hls_list_size 0 \
    -movflags +faststart \
    -hls_flags +split_by_time \
    -hls_segment_type fmp4 \
    -hls_fmp4_init_filename "init.mp4" \
    -hls_segment_filename "${EXPORT_DIR}/segment_%04d.m4s" \
    "${EXPORT_DIR}/index.m3u8"
```
