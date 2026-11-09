"use client";

import { useCallback, useEffect, useState } from "react";

type Insets = { top: number; right: number; bottom: number; left: number };
type Button = {
  setText?: (text: string) => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
  show: () => void;
  hide: () => void;
};

type WebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string } };
  platform?: string;
  colorScheme?: "light" | "dark";
  themeParams?: { bg_color?: string; secondary_bg_color?: string; button_color?: string };
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  ready: () => void;
  expand: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  onEvent: (name: string, listener: () => void) => void;
  offEvent: (name: string, listener: () => void) => void;
  BackButton?: Button;
  MainButton?: Button;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium") => void;
    notificationOccurred: (status: "success") => void;
  };
};

declare global {
  interface Window { Telegram?: { WebApp?: WebApp } }
}

const SCRIPT_ID = "telegram-web-app";
const events = ["themeChanged", "viewportChanged", "safeAreaChanged", "contentSafeAreaChanged"];
const sides = ["top", "right", "bottom", "left"] as const;

function availableApp() {
  const app = window.Telegram?.WebApp;
  return app && (app.initData || (app.platform && app.platform !== "unknown")) ? app : null;
}

export function useTelegram() {
  const [app, setApp] = useState<WebApp | null>(null);
  const [ready, setReady] = useState(false);
  const impact = useCallback((long = false) => {
    if (app?.isVersionAtLeast?.("6.1")) app.HapticFeedback?.impactOccurred(long ? "medium" : "light");
  }, [app]);
  const success = useCallback(() => {
    if (app?.isVersionAtLeast?.("6.1")) app.HapticFeedback?.notificationOccurred("success");
  }, [app]);

  useEffect(() => {
    const read = () => {
      const candidate = availableApp();
      if (candidate) setApp(candidate);
      setReady(true);
    };
    if (window.Telegram?.WebApp) {
      read();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", read);
    script.addEventListener("error", read);
    if (!existing && script instanceof HTMLScriptElement) {
      script.id = SCRIPT_ID;
      script.src = "https://telegram.org/js/telegram-web-app.js";
      script.async = true;
      document.head.appendChild(script);
    }
    const fromTelegram = /tgWebApp(Data|Platform|Version)/.test(location.hash + location.search) || window.parent !== window;
    const timeout = window.setTimeout(read, fromTelegram ? 3200 : 250);
    return () => {
      clearTimeout(timeout);
      script.removeEventListener("load", read);
      script.removeEventListener("error", read);
    };
  }, []);

  useEffect(() => {
    if (!app) return;
    const root = document.documentElement;
    const sync = () => {
      const height = app.viewportHeight || app.viewportStableHeight;
      if (height && height > 160) root.style.setProperty("--tg-app-height", height + "px");
      for (const side of sides) {
        const inset = (app.safeAreaInset?.[side] ?? 0) + (app.contentSafeAreaInset?.[side] ?? 0);
        root.style.setProperty("--tg-inset-" + side, inset + "px");
      }
      const bg = app.themeParams?.bg_color;
      if (bg && /^#[0-9a-f]{6}$/i.test(bg)) root.style.setProperty("--tg-bg", bg);
      root.dataset.telegramTheme = app.colorScheme ?? "dark";
    };
    const supported = app.isVersionAtLeast?.("8.0") ? events : events.slice(0, 2);
    for (const event of supported) app.onEvent(event, sync);
    app.ready();
    app.expand();
    sync();
    return () => {
      for (const event of supported) app.offEvent(event, sync);
      root.style.removeProperty("--tg-app-height");
      root.style.removeProperty("--tg-bg");
      for (const side of sides) root.style.removeProperty("--tg-inset-" + side);
      delete root.dataset.telegramTheme;
    };
  }, [app]);

  useEffect(() => {
    const root = document.documentElement;
    const visual = window.visualViewport;
    const sync = () => {
      const height = app?.viewportHeight || (visual?.scale === 1 ? visual.height : window.innerHeight);
      if (height > 160) root.style.setProperty("--visual-height", height + "px");
      root.dataset.compact = String(window.innerWidth <= 740 && height <= 560);
    };
    window.addEventListener("resize", sync);
    visual?.addEventListener("resize", sync);
    app?.onEvent("viewportChanged", sync);
    sync();
    return () => {
      window.removeEventListener("resize", sync);
      visual?.removeEventListener("resize", sync);
      app?.offEvent("viewportChanged", sync);
      root.style.removeProperty("--visual-height");
      delete root.dataset.compact;
    };
  }, [app]);

  const user = app?.initDataUnsafe?.user;
  const name = typeof user?.first_name === "string" ? user.first_name.trim().slice(0, 60) : "";
  return {
    app, ready, initData: app?.initData ?? "",
    profile: user?.id && Number.isSafeInteger(user.id) ? "tg-" + user.id : "browser",
    name: name || "شادمان",
    impact, success,
  };
}

export function useTelegramDialog(app: WebApp | null, open: boolean, close: () => void, confirm: () => void) {
  useEffect(() => {
    if (!app || !open) return;
    const back = app.isVersionAtLeast?.("6.1") ? app.BackButton : undefined;
    const main = app.MainButton;
    back?.onClick(close);
    back?.show();
    main?.setText?.("پاک کردن گفت‌وگو");
    main?.onClick(confirm);
    main?.show();
    return () => {
      back?.offClick(close);
      back?.hide();
      main?.offClick(confirm);
      main?.hide();
    };
  }, [app, open, close, confirm]);
}
