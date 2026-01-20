"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Post = {
  id: number;
  title: string;
  body: string;
  created_at: string;
};

type Comment = {
  id: number;
  body: string;
  created_at: string;
};

export default function PostDetailPage() {
  const params = useParams<{ postId: string }>();
  const postId = Number(params.postId);

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [commentText, setCommentText] = useState("");

  /* ---------------- 글 로드 ---------------- */
  useEffect(() => {
    loadPost();
    loadComments();
    loadLikes();
  }, []);

  async function loadPost() {
    const res = await supabaseBrowser
      .from("posts")
      .select("id, title, body, created_at")
      .eq("id", postId)
      .single();

    if (!res.error) setPost(res.data);
  }

  async function loadComments() {
    const res = await supabaseBrowser
      .from("comments")
      .select("id, body, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (!res.error) setComments(res.data || []);
  }

  async function loadLikes() {
    const user = (await supabaseBrowser.auth.getUser()).data.user;
    if (!user) return;

    const countRes = await supabaseBrowser
      .from("likes")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId);

    setLikeCount(countRes.count || 0);

    const likedRes = await supabaseBrowser
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .maybeSingle();

    setLiked(!!likedRes.data);
  }

  /* ---------------- 좋아요 ---------------- */
  async function toggleLike() {
    const user = (await supabaseBrowser.auth.getUser()).data.user;
    if (!user) return;

    if (liked) {
      await supabaseBrowser
        .from("likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
    } else {
      await supabaseBrowser.from("likes").insert({
        post_id: postId,
        user_id: user.id,
      });
    }

    loadLikes();
  }

  /* ---------------- 댓글 작성 ---------------- */
  async function submitComment() {
    if (commentText.trim().length === 0) return;

    const user = (await supabaseBrowser.auth.getUser()).data.user;
    if (!user) return;

    await supabaseBrowser.from("comments").insert({
      post_id: postId,
      author_id: user.id,
      body: commentText.trim(),
    });

    setCommentText("");
    loadComments();
  }

  if (!post) {
    return <div style={{ padding: 20 }}>글을 불러오는 중...</div>;
  }

  return (
    <main style={{ padding: 20, maxWidth: 720, margin: "0 auto" }}>

      {/* 제목 */}
      <h1 style={{ fontSize: 26, marginBottom: 12 }}>{post.title}</h1>

      {/* 본문 */}
      <div style={{ whiteSpace: "pre-wrap", marginBottom: 20 }}>
        {post.body}
      </div>

      {/* 좋아요 */}
      <button
        onClick={toggleLike}
        style={{
          background: "var(--orange)",
          borderRadius: 999,
          padding: "8px 16px",
          fontWeight: 900,
          border: "none",
          marginBottom: 20,
        }}
      >
         좋아요 {likeCount}
      </button>

      {/* 댓글 목록 */}
      <div style={{ marginBottom: 16 }}>
        <h3>댓글</h3>
        {comments.map((c) => (
          <div key={c.id} style={{ borderTop: "1px solid #333", padding: "8px 0" }}>
            {c.body}
          </div>
        ))}
      </div>

      {/* 댓글 작성 */}
      <textarea
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
        placeholder="댓글을 입력하세요"
        style={{
          width: "100%",
          minHeight: 80,
          marginBottom: 8,
        }}
      />
      <button onClick={submitComment} className="searchButton">
        댓글 작성
      </button>
    </main>
  );
}