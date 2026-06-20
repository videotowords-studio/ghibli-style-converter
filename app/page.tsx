"use client";

import {
  Download,
  ImagePlus,
  Loader2,
  RefreshCcw,
  Sparkles,
  UploadCloud,
  X
} from "lucide-react";
import Image from "next/image";
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";

type TransformResponse = {
  image?: string;
  mimeType?: string;
  error?: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string>("");
  const [resultMimeType, setResultMimeType] = useState<string>("image/png");
  const [error, setError] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const outputExtension = useMemo(() => {
    if (resultMimeType.includes("jpeg") || resultMimeType.includes("jpg")) {
      return "jpg";
    }

    if (resultMimeType.includes("webp")) {
      return "webp";
    }

    return "png";
  }, [resultMimeType]);

  function validateImage(nextFile: File) {
    if (!nextFile.type.startsWith("image/")) {
      return "请选择图片文件。";
    }

    if (nextFile.size > MAX_IMAGE_BYTES) {
      return "图片不能超过 8MB。";
    }

    return "";
  }

  function acceptFile(nextFile?: File) {
    if (!nextFile) {
      return;
    }

    const validationError = validateImage(nextFile);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setResultUrl("");
    setError("");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  }

  async function handleTransform() {
    if (!file || isLoading) {
      return;
    }

    setIsLoading(true);
    setError("");
    setResultUrl("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/transform", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as TransformResponse;

      if (!response.ok || !payload.image) {
        throw new Error(payload.error || "转换失败，请稍后再试。");
      }

      setResultUrl(payload.image);
      setResultMimeType(payload.mimeType || "image/png");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "转换失败，请稍后再试。"
      );
    } finally {
      setIsLoading(false);
    }
  }

  function clearImage() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(null);
    setPreviewUrl("");
    setResultUrl("");
    setError("");
  }

  return (
    <main className="shell">
      <section className="workspace" aria-label="图片转换工作台">
        <header className="masthead">
          <div>
            <p className="eyebrow">Gemini Image Studio</p>
            <h1>Ghibli 转绘</h1>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={clearImage}
            disabled={!file && !resultUrl}
            aria-label="清空当前图片"
            title="清空当前图片"
          >
            <RefreshCcw aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="panels">
          <section className="tool-panel" aria-label="上传原图">
            <div className="panel-title">
              <ImagePlus aria-hidden="true" size={18} />
              <span>原图</span>
            </div>

            <label
              className={`upload-zone ${isDragging ? "is-dragging" : ""} ${
                previewUrl ? "has-preview" : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
              />

              {previewUrl ? (
                <Image
                  src={previewUrl}
                  alt="原图预览"
                  fill
                  sizes="(max-width: 900px) 100vw, 50vw"
                  unoptimized
                  className="preview-image"
                />
              ) : (
                <div className="upload-empty">
                  <UploadCloud aria-hidden="true" size={32} />
                  <span>选择图片</span>
                  <small>PNG、JPG、WEBP · 8MB 内</small>
                </div>
              )}
            </label>

            <div className="actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => inputRef.current?.click()}
              >
                <UploadCloud aria-hidden="true" size={18} />
                上传
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={handleTransform}
                disabled={!file || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="spin" aria-hidden="true" size={18} />
                ) : (
                  <Sparkles aria-hidden="true" size={18} />
                )}
                {isLoading ? "生成中" : "开始转绘"}
              </button>
            </div>
          </section>

          <section className="tool-panel" aria-label="生成结果">
            <div className="panel-title">
              <Sparkles aria-hidden="true" size={18} />
              <span>结果</span>
            </div>

            <div className={`result-frame ${resultUrl ? "has-result" : ""}`}>
              {resultUrl ? (
                <Image
                  src={resultUrl}
                  alt="转换后的图片"
                  fill
                  sizes="(max-width: 900px) 100vw, 50vw"
                  unoptimized
                  className="preview-image"
                />
              ) : (
                <div className="result-empty">
                  {isLoading ? (
                    <Loader2 className="spin" aria-hidden="true" size={34} />
                  ) : (
                    <Sparkles aria-hidden="true" size={34} />
                  )}
                  <span>{isLoading ? "正在生成" : "等待生成"}</span>
                </div>
              )}
            </div>

            <div className="actions">
              <a
                className={`download-button ${resultUrl ? "" : "is-disabled"}`}
                href={resultUrl || undefined}
                download={`ghibli-style.${outputExtension}`}
                aria-disabled={!resultUrl}
              >
                <Download aria-hidden="true" size={18} />
                下载
              </a>
              <button
                className="ghost-button"
                type="button"
                onClick={clearImage}
                disabled={!file && !resultUrl}
              >
                <X aria-hidden="true" size={18} />
                清空
              </button>
            </div>
          </section>
        </div>

        {error ? <p className="error-message">{error}</p> : null}
      </section>
    </main>
  );
}
