"use client";

import {
  Download,
  ImagePlus,
  Lock,
  LogIn,
  LogOut,
  Loader2,
  Mail,
  RefreshCcw,
  Sparkles,
  UploadCloud,
  UserPlus,
  X
} from "lucide-react";
import Image from "next/image";
import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

type TransformResponse = {
  image?: string;
  mimeType?: string;
  error?: string;
};

type AuthUser = {
  email: string;
};

type AuthResponse = {
  user?: AuthUser | null;
  token?: string;
  error?: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "";
const SESSION_TOKEN_KEY = "ghibli_session_token";

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string>("");
  const [resultMimeType, setResultMimeType] = useState<string>("image/png");
  const [error, setError] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);

  const outputExtension = useMemo(() => {
    if (resultMimeType.includes("jpeg") || resultMimeType.includes("jpg")) {
      return "jpg";
    }

    if (resultMimeType.includes("webp")) {
      return "webp";
    }

    return "png";
  }, [resultMimeType]);

  useEffect(() => {
    let ignore = false;

    async function loadSession() {
      try {
        const token = window.localStorage.getItem(SESSION_TOKEN_KEY);
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          headers: token
            ? {
                Authorization: `Bearer ${token}`
              }
            : undefined,
          credentials: "include"
        });

        const payload = (await response.json()) as AuthResponse;

        if (!ignore && response.ok && payload.user) {
          setUser(payload.user);
        }
      } catch {
        // A missing session is fine; the user can log in from the form.
      } finally {
        if (!ignore) {
          setSessionLoading(false);
        }
      }
    }

    loadSession();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (authLoading) {
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    try {
      const response = await fetch(`${API_BASE}/api/auth/${authMode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });

      const payload = (await response.json()) as AuthResponse;

      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "操作失败，请稍后再试。");
      }

      if (payload.token) {
        window.localStorage.setItem(SESSION_TOKEN_KEY, payload.token);
      }

      setUser(payload.user);
      setPassword("");
      setError("");
    } catch (caughtError) {
      setAuthError(
        caughtError instanceof Error ? caughtError.message : "操作失败，请稍后再试。"
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    const token = window.localStorage.getItem(SESSION_TOKEN_KEY);

    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: token
        ? {
            Authorization: `Bearer ${token}`
          }
        : undefined,
      credentials: "include"
    });

    window.localStorage.removeItem(SESSION_TOKEN_KEY);
    setUser(null);
    clearImage();
  }

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
      const token = window.localStorage.getItem(SESSION_TOKEN_KEY);

      const response = await fetch(`${API_BASE}/api/transform`, {
        method: "POST",
        headers: token
          ? {
              Authorization: `Bearer ${token}`
            }
          : undefined,
        credentials: "include",
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
          <div className="header-actions">
            {user ? <span className="user-chip">{user.email}</span> : null}
            {user ? (
              <button
                className="icon-button"
                type="button"
                onClick={handleLogout}
                aria-label="退出登录"
                title="退出登录"
              >
                <LogOut aria-hidden="true" size={18} />
              </button>
            ) : null}
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
          </div>
        </header>

        {sessionLoading ? (
          <div className="session-loading">
            <Loader2 className="spin" aria-hidden="true" size={28} />
            <span>检查登录状态</span>
          </div>
        ) : user ? (
          <>
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
          </>
        ) : (
          <section className="auth-panel" aria-label="邮箱登录注册">
            <div className="auth-copy">
              <Sparkles aria-hidden="true" size={28} />
              <h2>{authMode === "login" ? "登录后开始转绘" : "创建你的账号"}</h2>
              <p>使用邮箱账号保存访问权限，之后可以继续扩展历史记录和个人素材库。</p>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label>
                <span>邮箱</span>
                <div className="input-wrap">
                  <Mail aria-hidden="true" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </label>

              <label>
                <span>密码</span>
                <div className="input-wrap">
                  <Lock aria-hidden="true" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="至少 8 位"
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                    required
                    minLength={8}
                  />
                </div>
              </label>

              {authError ? <p className="error-message auth-error">{authError}</p> : null}

              <button className="primary-button auth-submit" type="submit" disabled={authLoading}>
                {authLoading ? (
                  <Loader2 className="spin" aria-hidden="true" size={18} />
                ) : authMode === "login" ? (
                  <LogIn aria-hidden="true" size={18} />
                ) : (
                  <UserPlus aria-hidden="true" size={18} />
                )}
                {authLoading ? "处理中" : authMode === "login" ? "登录" : "注册"}
              </button>

              <button
                className="link-button"
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setAuthError("");
                }}
              >
                {authMode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
              </button>
            </form>
          </section>
        )}
      </section>
    </main>
  );
}
