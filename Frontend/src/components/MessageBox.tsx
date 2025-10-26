import React from 'react';

export default function MessageBox({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = React.useState('');
  const id = React.useId();
  const fieldId = `chat-message-${id}`;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onSend(text.trim()); setText(''); } }}
      className="flex gap-2 items-center"
      aria-label="Send a message"
    >
      <label htmlFor={fieldId} className="sr-only">Message</label>
      <input
        id={fieldId}
        name="message"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message"
        autoComplete="off"
        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-ocean-200"
      />
      <button type="submit" className="btn-accent" aria-label="Send message">Send</button>
    </form>
  );
}
