"use client";

import { PresenceUser } from "@/hooks/useSocket";

interface PresenceBarProps {
  users: PresenceUser[];
  connected: boolean;
}

export function PresenceBar({ users, connected }: PresenceBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-100">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-gray-300"}`}
        />
        <span className="text-xs text-gray-500">{connected ? "Live" : "Offline"}</span>
      </div>

      {users.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 mr-1">Online:</span>
          <div className="flex -space-x-1">
            {users.slice(0, 6).map((user) => (
              <div
                key={user.userId}
                title={user.name}
                className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-medium border-2 border-white ring-1 ring-indigo-300"
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            ))}
            {users.length > 6 && (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-medium border-2 border-white">
                +{users.length - 6}
              </div>
            )}
          </div>
          <span className="text-xs text-gray-400 ml-1">{users.length} online</span>
        </div>
      )}
    </div>
  );
}
