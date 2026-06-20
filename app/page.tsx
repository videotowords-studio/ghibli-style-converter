"use client";

import {
  BookOpenText,
  Clock3,
  Copy,
  Download,
  Heart,
  History,
  ImagePlus,
  Lock,
  LogIn,
  LogOut,
  Loader2,
  Mail,
  Moon,
  RefreshCcw,
  Sparkles,
  UploadCloud,
  UserCircle,
  UserPlus,
  WalletCards,
  WandSparkles,
  X
} from "lucide-react";
import Image from "next/image";
import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

type Tab = "essay" | "image" | "dream" | "wish" | "lottery" | "history" | "member";

type AuthUser = {
  email: string;
  credits: number;
  lastCheckinDate?: string | null;
};

type AuthResponse = {
  user?: AuthUser | null;
  token?: string;
  message?: string;
  error?: string;
};

type TransformResponse = {
  image?: string;
  mimeType?: string;
  credits?: number;
  error?: string;
};

type TextResponse = {
  article?: string;
  dream?: string;
  credits?: number;
  error?: string;
};

type HistoryItem = {
  id: number;
  kind: "image" | "essay" | "dream" | "lottery";
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

type WishItem = {
  id: number;
  email: string;
  content: string;
  created_at: string;
};

type WishesResponse = {
  wishes?: WishItem[];
  credits?: number;
  error?: string;
};

type LotteryResponse = {
  prize?: number;
  credits?: number;
  error?: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "";
const SESSION_TOKEN_KEY = "ghibli_session_token";

const tabs: Array<{ id: Tab; label: string; icon: typeof BookOpenText }> = [
  { id: "essay", label: "作文宝", icon: BookOpenText },
  { id: "image", label: "吉卜力转绘", icon: ImagePlus },
  { id: "dream", label: "周工解梦", icon: Moon },
  { id: "wish", label: "心愿墙", icon: Heart },
  { id: "lottery", label: "积分抽奖", icon: WandSparkles },
  { id: "history", label: "生成记录", icon: History },
  { id: "member", label: "会员中心", icon: UserCircle }
];

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

function maskEmail(email: string) {
  const [name, domain] = email.split("@");

  if (!domain) {
    return email;
  }

  return `${name.slice(0, 2)}***@${domain}`;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>("essay");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string>("");
  const [resultMimeType, setResultMimeType] = useState<string>("image/png");
  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [essayInput, setEssayInput] = useState("");
  const [essay, setEssay] = useState("");
  const [essayLoading, setEssayLoading] = useState(false);
  const [dreamInput, setDreamInput] = useState("");
  const [dream, setDream] = useState("");
  const [dreamLoading, setDreamLoading] = useState(false);
  const [wishInput, setWishInput] = useState("");
  const [wishes, setWishes] = useState<WishItem[]>([]);
  const [wishLoading, setWishLoading] = useState(false);
  const [lotteryLoading, setLotteryLoading] = useState(false);
  const [lotteryPrize, setLotteryPrize] = useState<number | null>(null);
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

  const imageDisabled = !file || isImageLoading || !user || user.credits < 110;
  const essayDisabled =
    essayInput.trim().length < 4 || essayLoading || !user || user.credits < 5;
  const dreamDisabled =
    dreamInput.trim().length < 4 || dreamLoading || !user || user.credits < 5;
  const lotteryDisabled = lotteryLoading || !user || user.credits < 2;

  const updateCredits = useCallback((credits?: number) => {
    if (typeof credits !== "number") {
      return;
    }

    setUser((current) => (current ? { ...current, credits } : current));
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/history`, {
        headers: authHeaders(),
        credentials: "include"
      });

      const payload = (await response.json()) as HistoryResponse;

      if (response.ok) {
        setHistory(payload.history || []);
        updateCredits(payload.credits);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [updateCredits]);

  const loadWishes = useCallback(async () => {
    setWishLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/wishes`, {
        headers: authHeaders(),
        credentials: "include"
      });

      const payload = (await response.json()) as WishesResponse;

      if (response.ok) {
        setWishes(payload.wishes || []);
        updateCredits(payload.credits);
      }
    } finally {
      setWishLoading(false);
    }
  }, [updateCredits]);

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
          loadWishes();
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
  }, [loadHistory, loadWishes]);

  function showToast(message?: string) {
    if (!message) {
      return;
    }

    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
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
      showToast(payload.message || "欢迎回来");
      loadHistory();
      loadWishes();
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
    setWishes([]);
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

  async function handleEssaySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (essayDisabled) {
      return;
    }

    setEssayLoading(true);
    setError("");
    setEssay("");

    try {
      const response = await fetch(`${API_BASE}/api/write`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        credentials: "include",
        body: JSON.stringify({ input: essayInput })
      });

      const payload = (await response.json()) as TextResponse;

      if (!response.ok || !payload.article) {
        throw new Error(payload.error || "作文生成失败，请稍后再试。");
      }

      setEssay(payload.article);
      updateCredits(payload.credits);
      loadHistory();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "作文生成失败，请稍后再试。"
      );
    } finally {
      setEssayLoading(false);
    }
  }

  async function handleDreamSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (dreamDisabled) {
      return;
    }

    setDreamLoading(true);
    setError("");
    setDream("");

    try {
      const response = await fetch(`${API_BASE}/api/dream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        credentials: "include",
        body: JSON.stringify({ input: dreamInput })
      });

      const payload = (await response.json()) as TextResponse;

      if (!response.ok || !payload.dream) {
        throw new Error(payload.error || "解梦失败，请稍后再试。");
      }

      setDream(payload.dream);
      updateCredits(payload.credits);
      loadHistory();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "解梦失败，请稍后再试。"
      );
    } finally {
      setDreamLoading(false);
    }
  }

  async function handleWishSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!wishInput.trim()) {
      return;
    }

    setWishLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/wishes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        credentials: "include",
        body: JSON.stringify({ content: wishInput })
      });

      const payload = (await response.json()) as WishesResponse;

      if (!response.ok) {
        throw new Error(payload.error || "心愿提交失败，请稍后再试。");
      }

      setWishInput("");
      setWishes(payload.wishes || []);
      updateCredits(payload.credits);
      showToast("心愿已挂上墙");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "心愿提交失败，请稍后再试。"
      );
    } finally {
      setWishLoading(false);
    }
  }

  async function handleLottery() {
    if (lotteryDisabled) {
      return;
    }

    setLotteryLoading(true);
    setLotteryPrize(null);
    setError("");

    window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/lottery`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "include"
        });

        const payload = (await response.json()) as LotteryResponse;

        if (!response.ok || typeof payload.prize !== "number") {
          throw new Error(payload.error || "抽奖失败，请稍后再试。");
        }

        setLotteryPrize(payload.prize);
        updateCredits(payload.credits);
        loadHistory();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "抽奖失败，请稍后再试。"
        );
      } finally {
        setLotteryLoading(false);
      }
    }, 5000);
  }

  async function copyText(text: string) {
    if (!text) {
      return;
    }

    await navigator.clipboard.writeText(text);
    showToast("已复制");
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

  function renderTextTool(
    type: "essay" | "dream",
    input: string,
    output: string,
    loading: boolean,
    disabled: boolean,
    setInput: (value: string) => void,
    submit: (event: FormEvent<HTMLFormElement>) => void
  ) {
    const isEssay = type === "essay";

    return (
      <div className="writing-layout">
        <section className="tool-panel" aria-label={isEssay ? "作文宝" : "周工解梦"}>
          <div className="panel-title">
            {isEssay ? (
              <BookOpenText aria-hidden="true" size={18} />
            ) : (
              <Moon aria-hidden="true" size={18} />
            )}
            <span>{isEssay ? "作文宝" : "周工解梦"}</span>
            <small>{isEssay ? "5 积分/次" : "5 积分/次"}</small>
          </div>

          <p className="tool-hint">
            {isEssay
              ? "输入你想写的作文内容，系统将自动补全为高级文章。"
              : "输入你昨晚的梦境内容，让我帮你解密。"}
          </p>

          <form className="writing-form" onSubmit={submit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={1200}
              placeholder={
                isEssay
                  ? "例如：以时间的价值为主题，写一篇高考水平议论文。"
                  : "例如：我梦见自己在很大的学校里找不到教室，后来遇到一位老朋友。"
              }
            />
            <div className="writing-meta">
              <span>{input.length}/1200</span>
              <button className="primary-button" type="submit" disabled={disabled}>
                {loading ? (
                  <Loader2 className="spin" aria-hidden="true" size={18} />
                ) : (
                  <Sparkles aria-hidden="true" size={18} />
                )}
                {loading ? "生成中" : isEssay ? "生成作文" : "开始解梦"}
              </button>
            </div>
          </form>
        </section>

        <section className="tool-panel" aria-label="生成结果">
          <div className="panel-title">
            <Sparkles aria-hidden="true" size={18} />
            <span>{isEssay ? "作文结果" : "解梦结果"}</span>
          </div>
          <div className={`article-output ${output ? "has-text" : ""}`}>
            {output ? (
              <article>{output}</article>
            ) : (
              <div className="result-empty">
                {loading ? (
                  <Loader2 className="spin" aria-hidden="true" size={34} />
                ) : (
                  <Sparkles aria-hidden="true" size={34} />
                )}
                <span>{loading ? "正在生成" : "等待生成"}</span>
              </div>
            )}
          </div>
          <div className="actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => copyText(output)}
              disabled={!output}
            >
              <Copy aria-hidden="true" size={18} />
              复制
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => (isEssay ? setEssay("") : setDream(""))}
              disabled={!output}
            >
              <X aria-hidden="true" size={18} />
              清空
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderWorkspace() {
    if (activeTab === "essay") {
      return renderTextTool(
        "essay",
        essayInput,
        essay,
        essayLoading,
        essayDisabled,
        setEssayInput,
        handleEssaySubmit
      );
    }

    if (activeTab === "dream") {
      return renderTextTool(
        "dream",
        dreamInput,
        dream,
        dreamLoading,
        dreamDisabled,
        setDreamInput,
        handleDreamSubmit
      );
    }

    if (activeTab === "wish") {
      return (
        <div className="wish-layout">
          <section className="tool-panel">
            <div className="panel-title">
              <Heart aria-hidden="true" size={18} />
              <span>心愿墙</span>
              <small>不扣积分</small>
            </div>
            <p className="tool-hint">把你的心愿写下来吧，所有人都能看到留言内容和账号信息。</p>
            <form className="writing-form" onSubmit={handleWishSubmit}>
              <textarea
                className="wish-textarea"
                value={wishInput}
                onChange={(event) => setWishInput(event.target.value)}
                maxLength={200}
                placeholder="例如：希望期末考试顺利，也希望每天都能更勇敢一点。"
              />
              <div className="writing-meta">
                <span>{wishInput.length}/200</span>
                <button className="primary-button" type="submit" disabled={wishLoading}>
                  {wishLoading ? (
                    <Loader2 className="spin" aria-hidden="true" size={18} />
                  ) : (
                    <Heart aria-hidden="true" size={18} />
                  )}
                  挂上心愿
                </button>
              </div>
            </form>
          </section>

          <section className="tool-panel wish-wall">
            <div className="panel-title">
              <Heart aria-hidden="true" size={18} />
              <span>大家的心愿</span>
              <button className="inline-refresh" type="button" onClick={loadWishes}>
                <RefreshCcw aria-hidden="true" size={15} />
                刷新
              </button>
            </div>
            <div className="wish-list">
              {wishes.length ? (
                wishes.map((wish) => (
                  <article className="wish-card" key={wish.id}>
                    <p>{wish.content}</p>
                    <small>
                      {maskEmail(wish.email)} · {new Date(wish.created_at).toLocaleString("zh-CN")}
                    </small>
                  </article>
                ))
              ) : (
                <div className="result-empty static-empty">
                  <Heart aria-hidden="true" size={34} />
                  <span>暂无心愿</span>
                </div>
              )}
            </div>
          </section>
        </div>
      );
    }

    if (activeTab === "lottery") {
      return (
        <section className="tool-panel lottery-panel">
          <div className="panel-title">
            <WandSparkles aria-hidden="true" size={18} />
            <span>神秘积分抽奖</span>
            <small>2 积分/次</small>
          </div>
          <div className={`lottery-wheel ${lotteryLoading ? "is-spinning" : ""}`}>
            <div className="wheel-core">
              {lotteryLoading ? "转动中" : lotteryPrize ? `+${lotteryPrize}` : "1-9"}
            </div>
          </div>
          <p className="tool-hint">试试你的手气吧。转盘会转动 5 秒，随机获得 1 到 9 积分。</p>
          <div className="actions centered-actions">
            <button className="primary-button" type="button" onClick={handleLottery} disabled={lotteryDisabled}>
              {lotteryLoading ? (
                <Loader2 className="spin" aria-hidden="true" size={18} />
              ) : (
                <WandSparkles aria-hidden="true" size={18} />
              )}
              {lotteryLoading ? "抽奖中" : "开始抽奖"}
            </button>
          </div>
        </section>
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
                      {item.kind === "image"
                        ? "转绘"
                        : item.kind === "essay"
                          ? "作文"
                          : item.kind === "dream"
                            ? "解梦"
                            : "抽奖"}
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

    if (activeTab === "member") {
      return (
        <section className="tool-panel member-panel">
          <div className="panel-title">
            <UserCircle aria-hidden="true" size={18} />
            <span>会员中心</span>
          </div>
          <div className="member-grid">
            <div>
              <small>账号</small>
              <strong>{user?.email}</strong>
            </div>
            <div>
              <small>当前积分</small>
              <strong>{user?.credits ?? 0}</strong>
            </div>
            <div>
              <small>今日打卡</small>
              <strong>{user?.lastCheckinDate ? "已记录" : "下次登录自动赠送"}</strong>
            </div>
          </div>
          <p className="tool-hint">
            每个自然日首次登录赠送 5 积分。积分用完后，请联系站长充值。
          </p>
          <div className="actions">
            <button className="ghost-button" type="button" onClick={handleLogout}>
              <LogOut aria-hidden="true" size={18} />
              退出登录
            </button>
          </div>
        </section>
      );
    }

    return (
      <div className="panels">
        <section className="tool-panel" aria-label="上传原图">
          <div className="panel-title">
            <ImagePlus aria-hidden="true" size={18} />
            <span>吉卜力转绘</span>
            <small>110 积分/次</small>
          </div>
          <p className="tool-hint">上传你的图片，系统将自动修改为吉卜力风格。</p>

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
    );
  }

  return (
    <main className="shell">
      <section className="workspace" aria-label="小学生之友">
        <header className="masthead">
          <div>
            <p className="eyebrow">Primary School Studio</p>
            <h1>小学生之友</h1>
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

        {toast ? <div className="toast">{toast}</div> : null}

        {sessionLoading ? (
          <div className="session-loading">
            <Loader2 className="spin" aria-hidden="true" size={28} />
            <span>检查登录状态</span>
          </div>
        ) : user ? (
          <>
            <nav className="tabs" aria-label="功能切换">
              {tabs.map((tab) => {
                const Icon = tab.icon;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={activeTab === tab.id ? "is-active" : ""}
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (tab.id === "history") {
                        loadHistory();
                      }
                      if (tab.id === "wish") {
                        loadWishes();
                      }
                    }}
                  >
                    <Icon aria-hidden="true" size={17} />
                    {tab.label}
                  </button>
                );
              })}
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
              <h2>{authMode === "login" ? "登录后开始使用" : "创建你的账号"}</h2>
              <p>注册赠送 100 积分。每天首次登录还会额外赠送 5 积分。</p>
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
