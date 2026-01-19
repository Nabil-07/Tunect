import { useEffect, useState } from "react";
import api from "../../lib/apiClient";

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt?: string | null;
  authorName?: string | null;
  createdAt?: string;
};

const emptyForm = {
  title: "",
  slug: "",
  summary: "",
  content: "",
  coverImageUrl: "",
  status: "DRAFT" as "DRAFT" | "PUBLISHED",
  authorName: "",
};

export default function AdminBlogs() {
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const { data } = await api.get<{ items: BlogPost[] }>("/blogs/admin/list");
      setPosts(Array.isArray(data?.items) ? data.items : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to load blog posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!form.title.trim() || !form.content.trim()) {
      setError("Title and content are required.");
      return;
    }
    try {
      setSubmitting(true);
      if (editingId) {
        await api.patch(`/blogs/${editingId}`, form);
        setSuccess("Blog post updated.");
      } else {
        await api.post("/blogs", form);
        setSuccess("Blog post created.");
      }
      resetForm();
      loadPosts();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to save blog post");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (post: BlogPost) => {
    setEditingId(post.id);
    setForm({
      title: post.title || "",
      slug: post.slug || "",
      summary: post.summary || "",
      content: post.content || "",
      coverImageUrl: post.coverImageUrl || "",
      status: post.status || "DRAFT",
      authorName: post.authorName || "",
    });
  };

  const removePost = async (id: string) => {
    if (!confirm("Delete this blog post?")) return;
    try {
      await api.delete(`/blogs/${id}`);
      setSuccess("Blog post deleted.");
      loadPosts();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to delete blog post");
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Blog Posts</h1>
        <p className="text-sm text-slate-600">Create and publish updates for the landing page.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">{editingId ? "Edit Post" : "New Post"}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Title</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Slug (optional)</span>
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
          </div>

          <label className="text-sm block">
            <span className="block text-slate-600 mb-1">Summary</span>
            <textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              rows={3}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>

          <label className="text-sm block">
            <span className="block text-slate-600 mb-1">Content</span>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={8}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Cover Image URL</span>
              <input
                value={form.coverImageUrl}
                onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Author Name</span>
              <input
                value={form.authorName}
                onChange={(e) => setForm({ ...form, authorName: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as "DRAFT" | "PUBLISHED" })}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-ocean-700 px-4 py-2 text-white hover:bg-ocean-800 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Saving..." : editingId ? "Update Post" : "Create Post"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border px-4 py-2 hover:bg-slate-50"
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">All Posts</h2>
        {loading ? (
          <div className="h-32 rounded-xl bg-slate-50 animate-pulse" />
        ) : posts.length === 0 ? (
          <div className="text-sm text-slate-600">No blog posts yet.</div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div key={post.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border rounded-xl p-4">
                <div>
                  <div className="text-sm text-slate-500">{post.status}</div>
                  <div className="font-semibold text-slate-900">{post.title}</div>
                  <div className="text-xs text-slate-500">
                    {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "Unpublished"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(post)}
                    className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removePost(post.id)}
                    className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
