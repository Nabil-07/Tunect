import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../lib/apiClient";

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  publishedAt?: string;
  authorName?: string;
};

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<BlogPost | null>(null);

  useEffect(() => {
    if (!slug) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get<BlogPost>(`/blogs/${slug}`);
        if (!mounted) return;
        setPost(data ?? null);
      } catch {
        if (!mounted) return;
        setPost(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="h-64 rounded-2xl bg-slate-50 animate-pulse" />
      </main>
    );
  }

  if (!post) {
    return (
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="rounded-xl border bg-white p-6 text-slate-600">
          Blog post not found.
        </div>
        <Link to="/blogs" className="mt-4 inline-block text-sm text-ocean-700 hover:underline">
          Back to all posts
        </Link>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-12 max-w-3xl">
      <Link to="/blogs" className="text-sm text-ocean-700 hover:underline">
        ← Back to all posts
      </Link>

      <div className="mt-6 rounded-2xl border bg-white shadow-sm overflow-hidden">
        {post.coverImageUrl ? (
          <img src={post.coverImageUrl} alt={post.title} className="h-64 w-full object-cover" />
        ) : null}
        <div className="p-6 sm:p-8">
          <div className="text-xs text-slate-500">
            {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "Draft"}
          </div>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{post.title}</h1>
          <div className="mt-2 text-sm text-slate-500">
            {post.authorName ? `By ${post.authorName}` : "Tunect Team"}
          </div>
          {post.summary ? (
            <p className="mt-4 text-slate-700 font-medium">{post.summary}</p>
          ) : null}
          <div className="prose prose-slate mt-6 max-w-none">
            {post.content.split("\n").map((line, idx) => (
              <p key={idx}>{line}</p>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
