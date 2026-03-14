import { useEffect, useState, useRef } from "react";
import api from "../../lib/apiClient";
import RichTextEditor from "../../components/RichTextEditor";
import ImageCropModal from "../../components/ImageCropModal";
import { Image as ImageIcon, Loader2, X } from "lucide-react";

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
  isPillar?: boolean;
  pillarId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  pillar?: { id: string; title: string; slug: string } | null;
  _count?: { children: number };
  createdAt?: string;
};

type PillarOption = { id: string; title: string; slug: string; status: string };

const emptyForm = {
  title: "",
  slug: "",
  summary: "",
  content: "",
  coverImageUrl: "",
  status: "DRAFT" as "DRAFT" | "PUBLISHED",
  authorName: "",
  isPillar: false,
  pillarId: "" as string,
  seoTitle: "",
  seoDescription: "",
};

async function uploadCoverImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('useCase', 'blogs');
  const { data } = await api.post<{ key: string; downloadUrl: string }>('/uploads/direct', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.downloadUrl;
}

export default function AdminBlogs() {
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [pillars, setPillars] = useState<PillarOption[]>([]);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const [postsRes, pillarsRes] = await Promise.all([
        api.get<{ items: BlogPost[] }>("/blogs/admin/list"),
        api.get<PillarOption[]>("/blogs/admin/pillars"),
      ]);
      setPosts(Array.isArray(postsRes.data?.items) ? postsRes.data.items : []);
      setPillars(Array.isArray(pillarsRes.data) ? pillarsRes.data : []);
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
      const payload = {
        ...form,
        pillarId: form.isPillar ? null : (form.pillarId || null),
      };
      if (editingId) {
        await api.patch(`/blogs/${editingId}`, payload);
        setSuccess("Blog post updated.");
      } else {
        await api.post("/blogs", payload);
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
      isPillar: post.isPillar ?? false,
      pillarId: post.pillarId || "",
      seoTitle: post.seoTitle || "",
      seoDescription: post.seoDescription || "",
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
    <div className="p-6 space-y-8" data-testid="blogs-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Blog Posts</h1>
        <p className="text-sm text-slate-600">Create and publish updates for the landing page.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="blogs-error-alert">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" data-testid="blogs-success-alert">{success}</div>}

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">{editingId ? "Edit Post" : "New Post"}</h2>
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="blogs-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Title</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                data-testid="blogs-title-input"
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Slug (optional)</span>
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                data-testid="blogs-slug-input"
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
              data-testid="blogs-summary-input"
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>

          {/* Pillar Page toggle + Pillar selection */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer" aria-label="Toggle pillar page">
                <input
                  type="checkbox"
                  checked={form.isPillar}
                  onChange={(e) => setForm({ ...form, isPillar: e.target.checked, pillarId: "" })}
                  data-testid="blogs-is-pillar-checkbox"
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
              </label>
              <span className="text-sm font-medium text-slate-700">
                {form.isPillar ? "This is a Pillar Page" : "Is this a Pillar Page?"}
              </span>
            </div>

            {form.isPillar && (
              <p className="text-xs text-indigo-600">
                Pillar pages act as main topic hubs. Supporting blogs can be linked to this pillar.
              </p>
            )}

            {!form.isPillar && (
              <label className="text-sm block">
                <span className="block text-slate-600 mb-1">Attach to Pillar Page (optional)</span>
                <select
                  value={form.pillarId}
                  onChange={(e) => setForm({ ...form, pillarId: e.target.value })}
                  data-testid="blogs-pillar-select"
                  className="w-full rounded-lg border px-3 py-2 bg-white"
                >
                  <option value="">— None (standalone blog) —</option>
                  {pillars.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.status.toLowerCase()})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* SEO Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">SEO Title (optional)</span>
              <input
                value={form.seoTitle}
                onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
                data-testid="blogs-seo-title-input"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Custom title for search engines"
                maxLength={70}
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">{form.seoTitle.length}/70</span>
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">SEO Description (optional)</span>
              <input
                value={form.seoDescription}
                onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
                data-testid="blogs-seo-description-input"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Meta description for search engines"
                maxLength={160}
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">{form.seoDescription.length}/160</span>
            </label>
          </div>

          {/* Rich Text Editor for Content */}
          <div className="text-sm">
            <span className="block text-slate-600 mb-1">Content</span>
            <RichTextEditor
              content={form.content}
              onChange={(html) => setForm((prev) => ({ ...prev, content: html }))}
              placeholder="Write your blog content here… Use the toolbar for formatting."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Cover Image Upload */}
            <div className="text-sm">
              <span className="block text-slate-600 mb-1">Cover Image</span>
              {form.coverImageUrl ? (
                <div className="relative rounded-lg overflow-hidden border">
                  <img
                    src={form.coverImageUrl}
                    alt="Cover preview"
                    className="h-32 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, coverImageUrl: "" })}
                    data-testid="blogs-remove-cover-button"
                    className="absolute top-1 right-1 rounded-full bg-white/90 p-1 shadow hover:bg-white"
                    title="Remove cover image"
                  >
                    <X className="h-4 w-4 text-slate-700" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploadingCover}
                  data-testid="blogs-upload-cover-button"
                  className="w-full h-32 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-ocean-400 hover:text-ocean-600 transition-colors disabled:opacity-60"
                >
                  {uploadingCover ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-xs">Uploading…</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-5 w-5" />
                      <span className="text-xs">Click to upload cover image</span>
                    </>
                  )}
                </button>
              )}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const objectUrl = URL.createObjectURL(file);
                  setCropImageSrc(objectUrl);
                  if (coverInputRef.current) coverInputRef.current.value = "";
                }}
              />
              {cropImageSrc && (
                <ImageCropModal
                  imageSrc={cropImageSrc}
                  aspectRatio={16 / 9}
                  onCancel={() => {
                    URL.revokeObjectURL(cropImageSrc);
                    setCropImageSrc(null);
                  }}
                  onConfirm={async (croppedBlob) => {
                    URL.revokeObjectURL(cropImageSrc);
                    setCropImageSrc(null);
                    setUploadingCover(true);
                    try {
                      const croppedFile = new File([croppedBlob], 'cover.jpg', { type: 'image/jpeg' });
                      const url = await uploadCoverImage(croppedFile);
                      setForm((prev) => ({ ...prev, coverImageUrl: url }));
                    } catch {
                      setError("Failed to upload cover image.");
                    } finally {
                      setUploadingCover(false);
                    }
                  }}
                />
              )}
              <input
                value={form.coverImageUrl}
                onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })}
                data-testid="blogs-cover-url-input"
                className="w-full rounded-lg border px-3 py-1.5 mt-2 text-xs"
                placeholder="…or paste image URL"
              />
            </div>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Author Name</span>
              <input
                value={form.authorName}
                onChange={(e) => setForm({ ...form, authorName: e.target.value })}
                data-testid="blogs-author-input"
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as "DRAFT" | "PUBLISHED" })}
                data-testid="blogs-status-select"
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
              data-testid="blogs-submit-button"
            >
              {(() => {
                if (submitting) return "Saving...";
                return editingId ? "Update Post" : "Create Post";
              })()}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border px-4 py-2 hover:bg-slate-50"
              disabled={submitting}
              data-testid="blogs-cancel-button"
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
              <div className="flex items-center gap-3">
                  {post.coverImageUrl && (
                    <img src={post.coverImageUrl} alt="" className="h-12 w-16 rounded-lg object-cover" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">{post.status}</span>
                      {post.isPillar && (
                        <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
                          PILLAR
                        </span>
                      )}
                      {post.pillar && (
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                          ↳ {post.pillar.title}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-slate-900">{post.title}</div>
                    <div className="text-xs text-slate-500">
                      {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "Unpublished"}
                      {post._count?.children
                        ? ` · ${post._count.children} linked blog${post._count.children > 1 ? 's' : ''}`
                        : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(post)}
                    data-testid={`blogs-edit-${post.id}`}
                    className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removePost(post.id)}
                    data-testid={`blogs-delete-${post.id}`}
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
