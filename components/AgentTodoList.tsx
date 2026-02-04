
import React, { useState } from 'react';
import { ListTodo, ChevronDown, ChevronUp } from 'lucide-react';
import { TodoItem } from '../types';

interface AgentTodoListProps {
  todos: TodoItem[];
}

const AgentTodoList: React.FC<AgentTodoListProps> = ({ todos }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const pendingCount = todos.filter(t => t.status === 'pending').length;

  return (
    <div className="bg-gray-850 border-b border-gray-700 shrink-0">
        <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between p-3 text-xs font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
        >
            <div className="flex items-center gap-2">
                <ListTodo size={14} className={pendingCount > 0 ? "text-yellow-400" : "text-gray-500"} />
                <span>任务面板 (待办: {pendingCount})</span>
            </div>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        
        {isExpanded && (
            <div className="px-3 pb-3 max-h-40 overflow-y-auto">
                {todos.length === 0 ? (
                    <div className="text-xs text-gray-600 italic py-2 text-center border border-dashed border-gray-700 rounded">
                        暂无任务 (Agent 空闲)
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {todos.map(todo => (
                            <li key={todo.id} className="flex items-start gap-2 text-xs p-2 bg-gray-900 rounded border border-gray-800">
                                <span className={todo.status === 'done' ? 'text-green-500' : 'text-gray-500'}>
                                    {todo.status === 'done' ? '☑' : '☐'}
                                </span>
                                <span className={`${todo.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-200'} flex-1`}>
                                    {todo.task}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        )}
    </div>
  );
};

export default AgentTodoList;
