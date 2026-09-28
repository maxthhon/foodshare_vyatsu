import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">FoodShare Platform</h1>
        <p className="text-gray-600 mb-6 text-sm">
          MVP клиентского приложения по спасению готовой еды из ресторанов и пекарен со скидкой до 70%.
        </p>
        <div className="p-4 bg-emerald-50 text-emerald-800 rounded-lg text-sm font-medium">
          Frontend & Environment настроены успешно
        </div>
      </div>
    </div>
  );
}
