export interface TextChannelMessage {
    session_id: string,
    speech_id: number,
    sequence_id: number,
    start_at: number,
    confirmed: boolean,
    recognizedText: [string, number][],
    resultText: string
}

export interface TelopChannelMessage {
    timestamp: number,
    message: string,
    vowel: string,
    text: string,
    length: number,
    new_text: boolean
}
