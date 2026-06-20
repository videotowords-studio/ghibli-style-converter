"use client";

import {
  BookOpenText,
  Clock3,
  Copy,
  Download,
  FileText,
  History,
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
  WalletCards,
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

type Tab = "image" | "article" | "history";

type AuthUser = {
  email: string;
  credits: number;
};

type AuthResponse = {
  user?: AuthUser | null;
  token?: string;
  error?: string;
};

type TransformResponse = {
  image?: string;
  mimeType?: string;
  credits?: number;
  error?: string;
};

type ArticleResponse = {
  article?: string;
  credits?: number;
  error?: string;
};

type HistoryItem = {
  id: number;
  kind: "image" | "article";
  title: string;
  input: string;
  output: string | null;
  cost: number;
  created_at: string;
};

type HistoryResponse = {
  history?: HistoryItem[];
  credits?: number;
  error?: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "";
const SESSION_TOKEN_KEY = "ghibli_session_token";

function authHeaders() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const token = window.localStorage.getItem(SESSION_TOKEN_KEY);

  return token
    ? {
        Authorization: `Bearer ${token}`
      }
    : undefined;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>("image");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string>("");
  const [resultMimeType, setResultMimeType] = useState<string>("image/png");
  const [error, setError] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [articleInput, setArticleInput] = useState("");
  const [article, setArticle] = useState("");
  const [articleLoading, setArticleLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
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

  const imageDisabled = !file || isImageLoading || !user || user.credits < 10;
  const articleDisabled =
    articleInput.trim().length < 4 || articleLoading || !user || user.credits < 5;

  useEffect(() => {
    let ignore = false;

    async function loadSession() {
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          headers: authHeaders(),
          credentials: "include"
        });

        const payload = (await response.json()) as AuthResponse;

        if (!ignore && response.ok && payload.user) {
          setUser(payload.user);
          loadHistory();
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

  async function loadHistory() {
    setHistoryLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/history`, {
        headers: authHeaders(),
        credentials: "include"
      });

      const payload = (await response.json()) as HistoryResponse;

      if (response.ok) {
        setHistory(payload.history || []);

        if (typeof payload.credits === "number") {
          setUser((current) =>
            current ? { ...current, credits: payload.credits ?? current.credits } : current
          );
        }
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  function updateCredits(credits?: number) {
    if (typeof credits !== "number") {
      return;
    }

    setUser((current) => (current ? { ...current, credits } : current));
  }

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
      loadHistory();
    } catch (caughtError) {
      setAuthError(
        caughtError instanceof Error ? caughtError.message : "操作失败，请稍后再试。"
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include"
    });

    window.localStorage.removeItem(SESSION_TOKEN_KEY);
    setUser(null);
    setHistory([]);
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
    if (!file || isImageLoading) {
      return;
    }

    setIsImageLoading(true);
    setError("");
    setResultUrl("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(`${API_BASE}/api/transform`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: formData
      });

      const payload = (await response.json()) as TransformResponse;

      if (!response.ok || !payload.image) {
        throw new Error(payload.error || "转换失败，请稍后再试。");
      }

      setResultUrl(payload.image);
      setResultMimeType(payload.mimeType || "image/png");
      updateCredits(payload.credits);
      loadHistory();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "转换失败，请稍后再试。"
      );
    } finally {
      setIsImageLoading(false);
    }
  }

  async function handleArticleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (articleDisabled) {
      return;
    }

    setArticleLoading(true);
    setError("");
    setArticle("");

    try {
      const response = await fetch(`${API_BASE}/api/write`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        credentials: "include",
        body: JSON.stringify({ input: articleInput })
      });

      const payload = (await response.json()) as ArticleResponse;

      if (!response.ok || !payload.article) {
        throw new Error(payload.error || "撰写失败，请稍后再试。");
      }

      setArticle(payload.article);
      updateCredits(payload.credits);
      loadHistory();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "撰写失败，请稍后再试。"
      );
    } finally {
      setArticleLoading(false);
    }
  }

  async function copyArticle(text = article) {
    if (!text) {
      return;
    }

    await navigator.clipboard.writeText(text);
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

  function renderWorkspace() {
    if (activeTab === "article") {
      return (
        <div className="writing-layout">
          <section className="tool-panel" aria-label="文案输入">
            <div className="panel-title">
              <BookOpenText aria-hidden="true" size={18} />
              <span>文案撰写</span>
              <small>5 积分/次</small>
            </div>

            <form className="writing-form" onSubmit={handleArticleSubmit}>
              <textarea
                value={articleInput}
                onChange={(event) => setArticleInput(event.target.value)}
                maxLength={1200}
                placeholder="输入主题、观点、素材或提纲，例如：以时间的价值为主题，写一篇高考水平议论文。"
              />
              <div className="writing-meta">
                <span>{articleInput.length}/1200</span>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={articleDisabled}
                >
                  {articleLoading ? (
                    <Loader2 className="spin" aria-hidden="true" size={18} />
                  ) : (
                    <FileText aria-hidden="true" size={18} />
                  )}
                  {articleLoading ? "撰写中" : "生成文章"}
                </button>
              </div>
            </form>
          </section>

          <section className="tool-panel" aria-label="文章结果">
            <div className="panel-title">
              <Sparkles aria-hidden="true" size={18} />
              <span>文章结果</span>
            </div>
            <div className={`article-output ${article ? "has-text" : ""}`}>
              {article ? (
                <article>{article}</article>
              ) : (
                <div className="result-empty">
                  {articleLoading ? (
                    <Loader2 className="spin" aria-hidden="true" size={34} />
                  ) : (
                    <FileText aria-hidden="true" size={34} />
                  )}
                  <span>{articleLoading ? "正在撰写" : "等待生成"}</span>
                </div>
              )}
            </div>
            <div className="actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => copyArticle()}
                disabled={!article}
              >
                <Copy aria-hidden="true" size={18} />
                复制
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setArticle("")}
                disabled={!article}
              >
                <X aria-hidden="true" size={18} />
                清空
              </button>
            </div>
          </section>
        </div>
      );
    }

    if (activeTab === "history") {
      return (
        <section className="tool-panel history-panel" aria-label="生成记录">
          <div className="panel-title">
            <History aria-hidden="true" size={18} />
            <span>生成记录</span>
            <button className="inline-refresh" type="button" onClick={loadHistory}>
              <RefreshCcw aria-hidden="true" size={15} />
              刷新
            </button>
          </div>

          {historyLoading ? (
            <div className="session-loading compact">
              <Loader2 className="spin" aria-hidden="true" size={26} />
              <span>读取记录</span>
            </div>
          ) : history.length ? (
            <div className="history-list">
              {history.map((item) => (
                <article className="history-item" key={item.id}>
                  <div className="history-head">
                    <span className={`kind-badge ${item.kind}`}>
                      {item.kind === "image" ? "转绘" : "文章"}
                    </span>
                    <strong>{item.title}</strong>
                    <small>-{item.cost} 积分</small>
                  </div>
                  <p>{item.input}</p>
                  {item.output ? (
                    item.kind === "image" && item.output.startsWith("data:image/") ? (
                      <div className="history-image">
                        <Image
                          src={item.output}
                          alt={item.title}
                          fill
                          unoptimized
                          sizes="220px"
                        />
                      </div>
                    ) : (
                      <pre>{item.output}</pre>
                    )
                  ) : null}
                  <time>
                    <Clock3 aria-hidden="true" size={14} />
                    {new Date(item.created_at).toLocaleString("zh-CN")}
                  </time>
                </article>
              ))}
            </div>
          ) : (
            <div className="result-empty static-empty">
              <History aria-hidden="true" size={34} />
              <span>暂无记录</span>
            </div>
          )}
        </section>
      );
    }

    return (
      <>
        <div className="panels">
          <section className="tool-panel" aria-label="上传原图">
            <div className="panel-title">
              <ImagePlus aria-hidden="true" size={18} />
              <span>吉卜力转绘</span>
              <small>10 积分/次</small>
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
                disabled={imageDisabled}
              >
                {isImageLoading ? (
                  <Loader2 className="spin" aria-hidden="true" size={18} />
                ) : (
                  <Sparkles aria-hidden="true" size={18} />
                )}
                {isImageLoading ? "生成中" : "开始转绘"}
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
                  {isImageLoading ? (
                    <Loader2 className="spin" aria-hidden="true" size={34} />
                  ) : (
                    <Sparkles aria-hidden="true" size={34} />
                  )}
                  <span>{isImageLoading ? "正在生成" : "等待生成"}</span>
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
      </>
    );
  }

  return (
    <main className="shell">
      <section className="workspace" aria-label="创作工作台">
        <header className="masthead">
          <div>
            <p className="eyebrow">Creative Studio</p>
            <h1>智能创作工坊</h1>
          </div>
          <div className="header-actions">
            {user ? (
              <span className="credit-chip">
                <WalletCards aria-hidden="true" size={17} />
                {user.credits} 积分
              </span>
            ) : null}
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
          </div>
        </header>

        {sessionLoading ? (
          <div className="session-loading">
            <Loader2 className="spin" aria-hidden="true" size={28} />
            <span>检查登录状态</span>
          </div>
        ) : user ? (
          <>
            <nav className="tabs" aria-label="功能切换">
              <button
                type="button"
                className={activeTab === "image" ? "is-active" : ""}
                onClick={() => setActiveTab("image")}
              >
                <ImagePlus aria-hidden="true" size={17} />
                图片转绘
              </button>
              <button
                type="button"
                className={activeTab === "article" ? "is-active" : ""}
                onClick={() => setActiveTab("article")}
              >
                <BookOpenText aria-hidden="true" size={17} />
                文案撰写
              </button>
              <button
                type="button"
                className={activeTab === "history" ? "is-active" : ""}
                onClick={() => {
                  setActiveTab("history");
                  loadHistory();
                }}
              >
                <History aria-hidden="true" size={17} />
                生成记录
              </button>
            </nav>

            {user.credits <= 0 ? (
              <p className="notice-message">积分已用完，请联系站长充值后继续使用。</p>
            ) : null}

            {renderWorkspace()}

            {error ? <p className="error-message">{error}</p> : null}
          </>
        ) : (
          <section className="auth-panel" aria-label="邮箱登录注册">
            <div className="auth-copy">
              <Sparkles aria-hidden="true" size={28} />
              <h2>{authMode === "login" ? "登录后开始创作" : "创建你的账号"}</h2>
              <p>新用户注册赠送 100 积分，可用于图片转绘和高考水平文章撰写。</p>
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
