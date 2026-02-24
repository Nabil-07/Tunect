import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import api from "../lib/apiClient";

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  summary?: string;
  coverImageUrl?: string;
  publishedAt?: string;
  authorName?: string;
  isPillar?: boolean;
  pillar?: { id: string; title: string; slug: string } | null;
};

export default function Blogs() {
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get<{ items: BlogPost[] }>("/blogs");
        if (!mounted) return;
        setPosts(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!mounted) return;
        setPosts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="container mx-auto px-4 py-12 max-w-6xl">
      <SEO
        title="Tunect Blog | Online Tutoring Tips & Stories | Tunect"
        description="Read the latest articles, tips, and stories about online tutoring, learning strategies, and success stories from Tunect's community of students and tutors."
        url="/blogs"
        type="website"
      />
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Tunect Blog</h1>
        <p className="mt-2 text-slate-600">Updates, tips, and stories from our learning community.</p>
      </div>

      {loading ? (
        <div className="h-40 rounded-xl bg-slate-50 animate-pulse" />
      ) : posts.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-slate-600">
          No posts yet. Check back soon for updates.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.id}
              to={`/blogs/${post.slug}`}
              className="group overflow-hidden rounded-2xl border bg-white shadow-sm hover:shadow-md transition"
            >
              {post.coverImageUrl ? (
                <img
                  src={post.coverImageUrl}
                  alt={`${post.title} - Tunect Blog`}
                  className="h-48 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-48 w-full bg-slate-100" />
              )}
              <div className="p-5">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "Draft"}</span>
                  {post.isPillar && (
                    <span className="bg-indigo-100 text-indigo-700 font-semibold px-1.5 py-0.5 rounded-full text-[10px]">
                      GUIDE
                    </span>
                  )}
                  {post.pillar && (
                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-[10px]">
                      ↳ {post.pillar.title}
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-lg font-semibold text-slate-900 group-hover:text-ocean-700">
                  {post.title}
                </h2>
                {post.summary ? (
                  <p className="mt-2 text-sm text-slate-600 line-clamp-3">{post.summary}</p>
                ) : null}
                <div className="mt-4 text-xs text-slate-500">
                  {post.authorName ? `By ${post.authorName}` : "Tunect Team"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
