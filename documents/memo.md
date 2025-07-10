Memo
===============

# 既知の問題

## スレッドの未開放
WebRTCで再接続するたびに、プロセスのOSスレッドが無限に増えます。
(1回のリロードで20程度)
[サンプルコード](https://github.com/aiortc/aiortc/tree/main/examples/server)でも
同様の症状が発生する模様。

```sh
% ps -f -T  -p `pgrep GloriouSpeech`
UID          PID    SPID    PPID  C STIME TTY          TIME CMD
gloria    640586  640586  640585 14 17:55 pts/7    00:00:47 GloriouSpeech
gloria    640586  640691  640585  0 17:55 pts/7    00:00:00 GloriouSpeech
gloria    640586  640692  640585  0 17:55 pts/7    00:00:00 GloriouSpeech
gloria    640586  640722  640585  0 17:55 pts/7    00:00:01 GloriouSpeech
gloria    640586  640723  640585  0 17:55 pts/7    00:00:01 GloriouSpeech
```

cgroupsのプロセス数制限機能を用いてテストすると、
`libgomp: Thread creation failed: Resource temporarily unavailable`や
`threading`の`RuntimeError: can't start new thread`でコケることが確認できました。
どこで生成されたスレッドが未開放なのかは今のところ不明です。

```sh
% sudo cgcreate -g pids:/thread_test
% sudo cgset -r pids.max=100 thread_test
% sudo chown -R gloria /sys/fs/cgroup/pids/thread_test
$ cgexec -g pids:thread_test ./start.sh
```
とりあえずWebRTCセッションの作成と処理を別プロセスに切り出し、
そのセッションの通信が終了したらプロセスごと終了する手法を取り回避しました。


# Processes

- GloriouSpeech
    - SpeechRecognizerProcessManager -> **SpeechRecognizerProcess**
    - RTCSessionProcessManager -> **RTCSessionProcess(RTCSes[track_id])**
        - RTCSession -> AudioTransformTrack -> **SpeechExtractorProcess(SpeechX[track_id])**
        - RTCSession -> AudioTransformTrack -> **VoiceSynthesizerProcess(VSynth[track_id])**


# Dataflow

- SpeechRecognizerProcessManager
    - resultManager.dataChannelResults -> {
            "track_id" => [
                {
                    "seq_no": int,
                    "status": "confirmed_voice | percial_voice",
                    "result": (("text", score))
                }
            ]
        }
    - resultManager.voiceResults -> {
            "track_id" => [
                {
                    "seq_no": int,
                    "status": "confirmed_voice | percial_voice",
                    "result": (("text", score))
                }
            ]
        }
    - resultManager.dataChannelSequenceNo -> {
            "track_id" => seq_no:int
        }
    - resultManager.voiceSequenceNo -> {
            "track_id" => seq_no:int
        }

- AudioTransformTrack(Receiver)
    - WebRTC -> AudioFrame -> 
    - AudioResampler -> AudioFrame ->
    - AudioFrame.to_ndarray -> ndarray ->
    - speechExtractorReaderQueue

- SpeechExtractorProcess
    - speechExtractorReaderQueue -> [ndarray] ->
    - SpeechExtractor ->  {
            "track_id": str,
            "status": "confirmed_voice | percial_voice",
            "duration": duration:float,
            "voice": voice:list,
        } ->
    - SpeechRecognizerProcessManager.readQueue

- SpeechRecognizerProcess
    - SpeechRecognizerProcessManager.readQueue -> {
            "track_id": str,
            "status": "confirmed_voice | percial_voice",
            "duration": duration:float,
            "voice": voice:list,
        } ->
    - SpeechRecognizer -> track_id: {
            "status": "confirmed_voice | percial_voice",
            "result": (("text", score))
        } ->
    -SpeechRecognizerProcessManager.resultManager.dataChannelResults && SpeechRecognizerProcessManager.resultManager.voiceResults

- VoiceSynthesizerProcess
    - SpeechRecognizerProcessManager.resultManager.voiceResults -> {
            "status": "confirmed_voice | percial_voice", "result": (("text", score))
        }
    - VoiceSynthesizer -> {
            "timestamp": timestamp_sec,
            "message": resultText,
            "vowel": mora["vowel"],
            "length": mora["length"],
            "text": mora["text"],
            "new_text": new_text,
            "vframe": resampled_frame.to_ndarray(),
        } ->
    - voiceSynthesizerWriterQueue

- AudioTransformTrack(TextTransmitter)
    - SpeechRecognizerProcessManager.resultManager.dataChannelQueue -> {
            "status": "confirmed_voice | percial_voice", "result": (("text", score))
        } ->
    - json.dumps -> {
            "status": "confirmed_voice | percial_voice", "result": [["text", score]]
        } ->
    - WebRTC.text_ch

- AudioTransformTrack(TelopTransmitter)
    - voiceSynthesizerWriterQueue -> {
            "timestamp": timestamp_sec,
            "message": resultText,
            "vowel": mora["vowel"],
            "length": mora["length"],
            "text": mora["text"],
            "new_text": new_text,
            "vframe": ndarray,
        } ->
    - json.dumps -> {
            "timestamp": timestamp_sec,
            "message": resultText,
            "vowel": mora["vowel"],
            "length": mora["length"],
            "text": mora["text"],
        } ->
    - WebRTC.voice_ch

- AudioTransformTrack(VoiceTransmitter)
    - voiceSynthesizerWriterQueue -> {
            "timestamp": timestamp_sec,
            "message": resultText,
            "vowel": mora["vowel"],
            "length": mora["length"],
            "text": mora["text"],
            "new_text": new_text,
            "vframe": ndarray,
        } ->
    - AudioFrame.from_ndarray | generate_dummy_frame() -> AudioFrame ->
    - WebRTC    
