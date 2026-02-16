export const chatGPTSelectors = {
  loginCtas: [
    'a:has-text("Log in")',
    'button:has-text("Log in")',
    'a:has-text("Sign in")',
    'button:has-text("Sign in")',
    'button:has-text("登录")',
    'a:has-text("登录")'
  ],
  newChatButtons: [
    'button:has-text("New chat")',
    'a:has-text("New chat")',
    'button:has-text("New conversation")',
    'button:has-text("新聊天")',
    'button[aria-label*="New chat"]',
    'button[data-testid="new-chat-button"]'
  ],
  attachButtons: [
    'button[aria-label*="Attach"]',
    'button[aria-label*="Upload"]',
    'button[aria-label*="Add photos"]',
    'button[aria-label*="上传"]',
    'button:has-text("Upload")',
    'button:has-text("上传")',
    'button:has-text("Add photos")'
  ],
  fileInputs: ['input[type="file"]'],
  composerInputs: [
    'textarea#prompt-textarea',
    'textarea[data-testid="prompt-textarea"]',
    'textarea[placeholder*="Message"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-lexical-editor="true"]'
  ],
  sendButtons: [
    'button[data-testid="send-button"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="发送"]',
    'button:has-text("Send")',
    'button:has-text("发送")',
    'button:has-text("Create image")',
    'button:has-text("创建图片")'
  ],
  attachmentIndicators: [
    'button[aria-label*="Remove attachment"]',
    'button[aria-label*="移除"]',
    'button[data-testid*="remove-attachment"]',
    'img[alt*="Uploaded"]',
    'img[alt*="attachment"]'
  ],
  resultImages: ['main img', 'article img'],
  downloadButtons: [
    'button[aria-label*="Download"]',
    'button[aria-label*="下载"]',
    'button:has-text("Download")',
    'button:has-text("下载")',
    'a[download]'
  ]
} as const;
