import nue_asr
import numpy as np
import torch
from torch import Tensor


class RecognizerError(Exception):
    pass


class SpeechRecognizer:
    def __init__(self, decode_options: dict):
        self.model = nue_asr.load_model(
            "rinna/nue-asr",
            use_deepspeed=True,
        )
        self.tokenizer = nue_asr.load_tokenizer("rinna/nue-asr")
        self.device = self.model.device
        self.decode_options = decode_options
        self.sampling_rate = 16000

        # https://huggingface.co/docs/transformers/main_classes/text_generation
        decode_options.setdefault("do_sample", False)
        decode_options.setdefault("num_beams", 1)
        decode_options.setdefault("temperature", 1.0)
        decode_options.setdefault("top_p", 1.0)
        decode_options.setdefault("min_new_tokens", 0)
        decode_options.setdefault("max_new_tokens", None)
        self.prefix_token = self.tokenizer.encode(
            "<s>",
            add_special_tokens=False,
            return_tensors="pt",
        )
        self.postfix_token = self.tokenizer.encode(
            "[SEP]",
            add_special_tokens=False,
            return_tensors="pt",
        )

    def transcribe(self, audio: np.ndarray, decode_options: dict) -> list:
        decode_options |= self.decode_options
        audio_tensor: Tensor = torch.from_numpy(audio)
        if audio_tensor.dim() != 1:
            assert (
                audio_tensor.dim() == 2 and audio_tensor.shape[0] == 1
            ), "Only mono audio is supported."

        audio_tensor = audio_tensor.to(self.model.dtype).reshape(1, -1)
        audio_len_sec = audio_tensor.shape[-1] / self.sampling_rate
        if self.decode_options["max_new_tokens"] is None:
            self.decode_options["max_new_tokens"] = int(4 * audio_len_sec + 20 + 0.5)

        try:
            with torch.inference_mode():
                outputs = self.model(
                    self.prefix_token.to(self.device),
                    audio_tensor.to(self.device),
                    self.postfix_token.to(self.device),
                    pad_token_id=self.tokenizer.pad_token_id,
                    bos_token_id=self.tokenizer.bos_token_id,
                    eos_token_id=self.tokenizer.eos_token_id,
                    **decode_options,
                )
                return [audio_tensor.to(self.device), outputs]
        except RuntimeError as e:
            raise RecognizerError(e)

    def decode(self, outputs) -> str:
        return self.tokenizer.decode(outputs[0], skip_special_tokens=True)

    # https://huggingface.co/transformers/v4.6.0/internal/generation_utils.html
    def transcribe_with_score(self, inputs, outputs, threshold=0.5) -> list:
        transition_scores = self.model.llm.compute_transition_scores(
            outputs.sequences, outputs.scores, normalize_logits=True
        )
        input_length = 1  # inputs.input_ids.shape[1]
        generated_tokens = outputs.sequences[:, input_length:]
        token_and_prob = []
        for tok, score in zip(generated_tokens[0], transition_scores[0]):
            # | token | token string | logits | probability
            # print(f"| {tok:5d} | {self.tokenizer.decode(tok):8s} | {score.cpu().numpy():.4f} | {np.exp(score.cpu().numpy()):.2%}")
            token_string = self.tokenizer.decode(tok)
            probability = np.exp(score.cpu().numpy())
            token_and_prob.append((token_string, float(probability)))

        return token_and_prob
