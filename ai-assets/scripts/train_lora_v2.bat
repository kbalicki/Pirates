@echo off
REM ============================================================
REM  Trening LoRA amigapxl_pirates_v2  (SD1.5, GTX 1060 6GB)
REM  Dataset: 82 obrazy 512x512, pojedyncze obiekty na plaskim tle
REM  Kroki: 82 img * 2 repeats / batch 2 = 82 kroki/epoke * 10 = 820
REM  (GTX 1060 = Pascal, FP16 okrojone do 1/64 -> ok. 4 s/krok, ~55 min)
REM ============================================================
set KOHYA=C:\AI\kohya_ss
set DS=C:\AI\kohya_ss\dataset\pirates_v2
set CKPT=C:\AI\ComfyUI\models\checkpoints\pixel-art-diffusion-v1.safetensors

REM kohya wypisuje komunikaty po japonsku - bez UTF-8 konsola cp1250 wywala UnicodeEncodeError
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

cd /d %KOHYA%
call venv\Scripts\activate.bat

accelerate launch --num_cpu_threads_per_process 2 sd-scripts/train_network.py ^
  --pretrained_model_name_or_path "%CKPT%" ^
  --train_data_dir "%DS%\img" ^
  --output_dir "%DS%\model" ^
  --logging_dir "%DS%\log" ^
  --output_name amigapxl_pirates_v2 ^
  --save_model_as safetensors ^
  --network_module networks.lora ^
  --network_dim 32 --network_alpha 16 ^
  --resolution 512,512 ^
  --train_batch_size 2 ^
  --max_train_epochs 10 ^
  --save_every_n_epochs 5 ^
  --learning_rate 1e-4 --unet_lr 1e-4 --text_encoder_lr 5e-5 ^
  --lr_scheduler cosine --lr_warmup_steps 80 ^
  --optimizer_type AdamW8bit ^
  --mixed_precision fp16 --save_precision fp16 ^
  --xformers --cache_latents --gradient_checkpointing ^
  --clip_skip 2 --seed 31337 ^
  --caption_extension .txt ^
  --max_data_loader_n_workers 1 ^
  --keep_tokens 1 ^
  --shuffle_caption
