"use client";

interface UserAvatarProps {
  name: string;
  isOnline?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "w-5 h-5 text-xs",
  md: "w-7 h-7 text-xs",
  lg: "w-8 h-8 text-sm",
};

export function UserAvatar({ name, isOnline = false, size = "md", className = "" }: UserAvatarProps) {
  const dotSize =
    size === "sm"
      ? "w-2 h-2 border border-white"
      : size === "lg"
      ? "w-3.5 h-3.5 border-2 border-white"
      : "w-2.5 h-2.5 border-2 border-white";

  return (
    <div
      title={`${name}${isOnline ? " (online)" : ""}`}
      className={`relative inline-flex shrink-0 overflow-visible ${className}`}
    >
      <div
        className={`${SIZE_CLASSES[size]} rounded-full bg-indigo-500 flex items-center justify-center text-white font-medium select-none`}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      {isOnline && (
        <span
          aria-label="online"
          className={`absolute -bottom-0.5 -right-0.5 ${dotSize} rounded-full bg-emerald-500 ring-1 ring-white z-10`}
        />
      )}
    </div>
  );
}
