import { useState, useEffect } from 'react';
import * as Msg from '../../services/messagesService';

export default function Chat() {
  const [convos, setConvos] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (typeof Msg.getConversations !== 'function') {
          setError('Messaging service not wired yet.');
          return;
        }
        const data = await Msg.getConversations();
        setConvos(Array.isArray(data) ? data : Array.isArray((data as any)?.items) ? (data as any).items : []);
      } catch (e) {
        console.error(e);
        setError('Failed to load conversations.');
      }
    })();
  }, []);

  const handleSend = async () => {
    if (!selected || !text.trim() || typeof Msg.sendMessage !== 'function') return;
    try {
      await Msg.sendMessage(selected.id, text.trim());
      setText('');
    } catch (e) {
      console.error(e);
      setError('Failed to send message.');
    }
  };

  return (
    <div className="p-6 grid grid-cols-3 gap-4">
      <div className="col-span-1 border-r pr-2">
        {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
        {convos.map((c) => (
          <div
            key={c.id}
            className={`p-2 cursor-pointer rounded ${selected?.id === c.id ? 'bg-blue-100' : ''}`}
            onClick={() => setSelected(c)}
          >
            {c.name ?? 'Conversation'}
          </div>
        ))}
      </div>
      <div className="col-span-2">
        {selected ? (
          <>
            <div className="h-64 border rounded p-4 mb-2 overflow-y-auto">[Chat here]</div>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full border rounded p-2"
              placeholder="Message..."
            />
            <button onClick={handleSend} className="mt-2 bg-blue-600 text-white px-4 py-1 rounded">Send</button>
          </>
        ) : (
          <p>Select a conversation</p>
        )}
      </div>
    </div>
  );
}
