(() => {
  const showCopyToast = () => {
    const toast = document.querySelector('.copy-toast');
    if (!toast) return;
    toast.classList.add('show');
    window.clearTimeout(showCopyToast.timer);
    showCopyToast.timer = window.setTimeout(() => {
      toast.classList.remove('show');
    }, 1500);
  };

  const copyCurrentUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showCopyToast();
    } catch (error) {
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showCopyToast();
    }
  };

  const getShareData = () => {
    const articleTitle = document.querySelector('.title-zh, h1');
    const text = articleTitle ? articleTitle.textContent.trim() : '';
    const shareData = {
      title: document.title,
      url: window.location.href
    };
    if (text) shareData.text = text;
    return shareData;
  };

  const setupCommentPanel = () => {
    const commentBtn = document.querySelector('.comment-btn');
    const commentPanel = document.getElementById('commentPanel');
    const commentOverlay = document.getElementById('commentOverlay');
    const closeCommentBtn = document.getElementById('closeCommentBtn');
    const commentList = document.getElementById('commentList');
    const commentComposeWrap = document.getElementById('commentComposeWrap');
    const commentInput = document.getElementById('commentInput');
    const cancelCommentBtn = document.getElementById('cancelCommentBtn');
    const submitCommentBtn = document.getElementById('submitCommentBtn');

    if (!commentBtn || !commentPanel || !commentOverlay || !closeCommentBtn || !commentList || !commentComposeWrap || !commentInput || !cancelCommentBtn || !submitCommentBtn) return;

    const commentsStorageKey = `comments:${window.location.pathname}`;

    const loadComments = () => {
      try {
        const cached = localStorage.getItem(commentsStorageKey);
        return cached ? JSON.parse(cached) : [];
      } catch (error) {
        return [];
      }
    };

    const saveComments = (comments) => {
      try {
        localStorage.setItem(commentsStorageKey, JSON.stringify(comments));
      } catch (error) {
        // Ignore storage errors to keep interaction smooth.
      }
    };

    const renderComments = (comments) => {
      commentList.innerHTML = '';
      comments.forEach((content) => {
        const item = document.createElement('div');
        item.className = 'comment-item';
        item.textContent = content;
        commentList.appendChild(item);
      });
      commentList.scrollTop = commentList.scrollHeight;
    };

    const clearComposeInput = () => {
      commentInput.value = '';
      commentInput.blur();
    };

    const openCommentPanel = () => {
      commentPanel.classList.add('open');
      commentOverlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    };

    const closeCommentPanel = () => {
      commentPanel.classList.remove('open');
      commentOverlay.classList.remove('show');
      document.body.style.overflow = '';
    };

    const openNewCommentSession = () => {
      openCommentPanel();
      commentComposeWrap.classList.remove('hidden');
      clearComposeInput();
      commentInput.focus();
    };

    const exitComposeState = () => {
      clearComposeInput();
      commentComposeWrap.classList.add('hidden');
    };

    const comments = loadComments();
    renderComments(comments);

    commentBtn.addEventListener('click', openNewCommentSession);
    closeCommentBtn.addEventListener('click', () => {
      closeCommentPanel();
      exitComposeState();
    });
    commentOverlay.addEventListener('click', () => {
      closeCommentPanel();
      exitComposeState();
    });

    cancelCommentBtn.addEventListener('click', cancelComment);
    submitCommentBtn.addEventListener('click', submitComment);
    commentInput.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        submitComment();
      }
    });

    function submitComment() {
      const value = commentInput.value.trim();
      if (!value) return;

      comments.push(value);
      saveComments(comments);
      renderComments(comments);
      exitComposeState();
    }

    function cancelComment() {
      exitComposeState();
    }
  };

  const setupShareButton = () => {
    const shareBtn = document.querySelector('.share-btn');
    if (!shareBtn) return;

    shareBtn.addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share(getShareData());
          return;
        } catch (error) {
          if (error && error.name === 'AbortError') return;
        }
      }
      await copyCurrentUrl();
    });
  };

  const initEssayActions = () => {
    setupCommentPanel();
    setupShareButton();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEssayActions, { once: true });
  } else {
    initEssayActions();
  }
})();
