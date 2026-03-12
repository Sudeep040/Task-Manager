"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: string;
              size?: string;
              width?: number;
              text?: string;
              shape?: string;
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  onSuccess: (credential: string) => void;
  onError?: (message: string) => void;
  text?: "signin_with" | "signup_with" | "continue_with";
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  text = "signin_with",
}: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) {
      onError?.("Google Client ID is not configured");
      return;
    }

    function initializeButton() {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId!,
        callback: (response) => onSuccess(response.credential),
        use_fedcm_for_prompt: true,
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: buttonRef.current.offsetWidth || 400,
        text,
        shape: "rectangular",
      });
    }

    // If the GSI script is already loaded
    if (window.google) {
      initializeButton();
      return;
    }

    // Load the GSI script
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeButton;
    script.onerror = () => onError?.("Failed to load Google Sign-In");
    document.head.appendChild(script);
  }, [clientId, onSuccess, onError, text]);

  if (!clientId) {
    return (
      <div className="w-full py-2.5 px-4 border border-gray-200 rounded-lg text-sm text-gray-400 text-center">
        Google Sign-In not configured
      </div>
    );
  }

  return <div ref={buttonRef} className="w-full" />;
}
