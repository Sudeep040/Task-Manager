 "use client";
 
 import { Task } from "@/lib/api-client";
 import { TaskCard } from "./TaskCard";
 
 interface TaskBoardProps {
   tasks: Task[];
   onTaskClick: (task: Task) => void;
   loading?: boolean;
 }
 
 // Only show the main kanban columns requested by the user.
 const COLUMNS: { key: Task["status"]; label: string; color: string }[] = [
   { key: "todo", label: "To Do", color: "bg-gray-50 border-gray-200" },
   { key: "in_progress", label: "In Progress", color: "bg-blue-50 border-blue-200" },
   { key: "done", label: "Done", color: "bg-green-50 border-green-200" },
 ];
 
 export function TaskBoard({ tasks, onTaskClick, loading }: TaskBoardProps) {
   const byStatus = (status: Task["status"]) => tasks.filter((t) => t.status === status);
 
  if (loading) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className="w-full rounded-xl border p-3 bg-gray-50 animate-pulse h-48"
          />
        ))}
      </div>
    );
  }
 
   return (
    // Vertical stacked columns: each column sits full-width stacked one below another.
   <div className="flex flex-col gap-4 pb-4">
       {COLUMNS.map((col) => {
         const colTasks = byStatus(col.key);
         return (
           <div
             key={col.key}
            className={`w-full rounded-xl border ${col.color} p-3`}
           >
             <div className="flex items-center justify-between mb-3">
               <h2 className="text-sm font-semibold text-gray-700">{col.label}</h2>
               <span className="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-500 font-medium">
                 {colTasks.length}
               </span>
             </div>
 
             <div className="flex flex-col gap-3">
               {colTasks.map((task) => (
                 <TaskCard key={task._id} task={task} onClick={onTaskClick} />
               ))}
               {colTasks.length === 0 && (
                 <p className="text-xs text-gray-400 text-center py-6">No tasks</p>
               )}
             </div>
           </div>
         );
       })}
     </div>
   );
 }
