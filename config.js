window.LAB_OT_CONFIG = {
  // Supabase Project URL + Publishable key
  SUPABASE_URL: 'https://xjbwuyhdpsmfimzaradu.supabase.co',
  SUPABASE_KEY: 'sb_publishable_yyLkUtatgoov6hR50VeLHQ_P8WGFZ-G',

  // บัญชีที่อนุญาตให้เข้าแอป
  USERS: {
    'parichat.ink@mahidol.ac.th': { role: 'admin', label: 'Admin' },
    'paleerat.ran@mahidol.ac.th': { role: 'staff', label: 'Staff' }
  }
};

// compatibility เผื่อไฟล์เก่าบางส่วนยังอ้างชื่อเดิม
window.PSC_OT_CONFIG = window.LAB_OT_CONFIG;
