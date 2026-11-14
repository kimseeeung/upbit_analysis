/**
 * 한/영 입력 (순수 함수).
 * 웹에서는 휴대폰 키보드 언어를 강제로 바꿀 수 없다. 그래서 영문 칸(아이디·비밀번호)에
 * 한글 자판 상태로 입력한 글자를 같은 자리의 영문으로 바꿔 준다. 예: "ㅅㄱ먀ㅜㄷㄱ1" → "trainer1"
 */

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = [
  "",
  "ㄱ",
  "ㄲ",
  "ㄳ",
  "ㄴ",
  "ㄵ",
  "ㄶ",
  "ㄷ",
  "ㄹ",
  "ㄺ",
  "ㄻ",
  "ㄼ",
  "ㄽ",
  "ㄾ",
  "ㄿ",
  "ㅀ",
  "ㅁ",
  "ㅂ",
  "ㅄ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

/** 두벌식 자판: 자모 → 영문 키 (쌍자음·ㅒ·ㅖ는 Shift = 대문자) */
const KEY: Record<string, string> = {
  ㅂ: "q",
  ㅈ: "w",
  ㄷ: "e",
  ㄱ: "r",
  ㅅ: "t",
  ㅛ: "y",
  ㅕ: "u",
  ㅑ: "i",
  ㅐ: "o",
  ㅔ: "p",
  ㅁ: "a",
  ㄴ: "s",
  ㅇ: "d",
  ㄹ: "f",
  ㅎ: "g",
  ㅗ: "h",
  ㅓ: "j",
  ㅏ: "k",
  ㅣ: "l",
  ㅋ: "z",
  ㅌ: "x",
  ㅊ: "c",
  ㅍ: "v",
  ㅠ: "b",
  ㅜ: "n",
  ㅡ: "m",
  ㅃ: "Q",
  ㅉ: "W",
  ㄸ: "E",
  ㄲ: "R",
  ㅆ: "T",
  ㅒ: "O",
  ㅖ: "P",
  // 겹모음·겹받침은 두 키로
  ㅘ: "hk",
  ㅙ: "ho",
  ㅚ: "hl",
  ㅝ: "nj",
  ㅞ: "np",
  ㅟ: "nl",
  ㅢ: "ml",
  ㄳ: "rt",
  ㄵ: "sw",
  ㄶ: "sg",
  ㄺ: "fr",
  ㄻ: "fa",
  ㄼ: "fq",
  ㄽ: "ft",
  ㄾ: "fx",
  ㄿ: "fv",
  ㅀ: "fg",
  ㅄ: "qt",
};

const HANGUL_RE = /[ㄱ-ㆎ가-힣]/;

export function hasHangul(s: string): boolean {
  return HANGUL_RE.test(s);
}

/** 한글 자판으로 친 글자를 영문 키로 바꾼다. 영문·숫자·기호는 그대로 */
export function hangulToQwerty(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const i = code - 0xac00;
      const cho = CHO[Math.floor(i / 588)];
      const jung = JUNG[Math.floor((i % 588) / 28)];
      const jong = JONG[i % 28];
      out +=
        (KEY[cho] ?? "") + (KEY[jung] ?? "") + (jong ? (KEY[jong] ?? "") : "");
    } else if (KEY[ch] !== undefined) {
      out += KEY[ch];
    } else {
      out += ch;
    }
  }
  return out;
}

export type KeyboardLang = "ko" | "en";

/** 칸 이름으로 기본 언어를 정한다: 아이디·비밀번호·이메일은 영문, 나머지 글자 칸은 한글 */
export function keyboardForLabel(
  label: string,
  type?: string,
): KeyboardLang | null {
  if (type === "password" || type === "email" || type === "url") return "en";
  if (type && type !== "text" && type !== "search") return null;
  if (/아이디|비밀번호|이메일|ID/i.test(label)) return "en";
  return "ko";
}
