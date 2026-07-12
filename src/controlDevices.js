// 制御装置（号機）割当・取り合い可視化のための純ロジック。
// 分割アプリ(rotary_table: nd287_app/controllers.py, seiban_flow.py) の
// 「モーター型式→必要容量」「号機マスタ→使える制御装置」ロジックを JS へ移植し、
// さらに「指図(納期基準の窓)を号機へ割り当て、取り合い(ケンカ)を検出」する部分を足したもの。
// React 非依存の純関数のみ。Node でそのままテストできる。

// ───────────────────────── 容量エンジン（分割アプリと同じ規則） ─────────────────────────

export const CAP_NUMS = [10, 20, 40, 80, 160, 360];

/** 容量表記を正規化（'40a' / ' 40A ' / '40' / 40 → '40A'）。空なら ''。 */
export function normCap(cap) {
  let s = String(cap == null ? '' : cap).trim().toUpperCase().replace('Ａ', 'A');
  if (!s) return '';
  if (s.endsWith('A')) s = s.slice(0, -1);
  s = s.trim();
  return s ? `${s}A` : '';
}

/** 全角英数記号(ａＡ０／ｉｓ 等)を半角へ。現場入力の型式は全角混じり(αｉF22/3000・Dｉｓ60/400)が多い。 */
export function toHalfWidth(s) {
  return String(s == null ? '' : s).replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

/** モーター型式に HV（High Voltage＝400V）の記載があれば true。 */
export function isHV(motorModel) {
  return toHalfWidth(motorModel).toUpperCase().includes('HV');
}

/** DDモーター(直駆動 DiS系)なら true。番手＝トルクで αiS の出力番手とは別物。 */
export function isDD(motorModel) {
  const norm = toHalfWidth(motorModel).replace(/[\s\-_]/g, '').toUpperCase();
  return norm.includes('DIS') || norm.startsWith('DD');
}

/** Dモーター＝(D)アンプ専用(号機32/35)の FANUC サーボなら true。
 *  判定 = FANUC αi/βi 系(αiS/αiF/βiS…)の型式で、モーター/アンプ区切り(-D)が付くもの。
 *    例: αiS8/4000-D, αIF 12/4000-D, αiF22/3000-D/αiA4000, αiA32000-D(アンプ側)。
 *  三菱の HG54T-D48 等(Dの後に数字=エンコーダ/ブレーキ記号)は除外。DD(直駆動 Dis)とは別概念。 */
export function isDAmp(motorModel) {
  const s = toHalfWidth(motorModel == null ? '' : motorModel).replace(/\s+/g, '').toUpperCase();
  if (!/[ΑΒAB]I[SF]/.test(s)) return false;      // FANUC αi/βi サーボの署名が無ければ対象外
  return /-D(?![0-9A-Z])/.test(s);               // '-D' で終わる区切り(直後に英数字が続く -D48 等は除外)
}

/** モーター型式から電源電圧を返す。HV記載→'400V'、型式があれば'200V'、無ければ''。 */
export function motorVoltage(motorModel) {
  const s = String(motorModel || '').trim();
  if (!s) return '';
  return isHV(s) ? '400V' : '200V';
}

// 番手→アンプ容量の標準組合せ（200V）。400V(HV)は電力同じでも電流が約半分なので半額コード。
const STD_BANDS_200 = [[4, '20A'], [12, '40A'], [30, '80A'], [50, '160A']];
const STD_BANDS_400 = [[4, '10A'], [12, '20A'], [30, '40A'], [50, '80A']];

/**
 * αiS/αiF モーター型式の「番手」から標準組合せのアンプ容量を返す。
 * 200V: 2,4→20A ／ 8,12→40A ／ 22,30→80A ／ 40,50→160A。
 * 400V(HV): 半額コード（2,4→10A ／ 8,12→20A ／ 22,30→40A ／ 40,50→80A）。
 * DDモーター(DiS系)や範囲外は '' を返す（手入力/対応表に回す）。
 */
export function standardCapacity(motorModel) {
  const raw = String(motorModel || '');
  if (isDD(raw)) return '';
  // 全角/大小/空白のゆれを吸収してから「(α) i S/F 番手 /」を拾う（誤ヒット防止のため '/' 必須）。
  //   例: αｉF22/3000・αiS8/4000-D・αIF 12/4000-D・βｉS4/4000 いずれも番手を抽出。
  const s = toHalfWidth(raw);
  const m = s.match(/[αaA]?\s*i\s*[sf]\s*(\d+)\s*\//i);
  if (!m) return '';
  const size = parseInt(m[1], 10);
  const bands = isHV(raw) ? STD_BANDS_400 : STD_BANDS_200;
  for (const [lim, cap] of bands) if (size <= lim) return cap;
  return ''; // 範囲外(αiS100等)はマスタ外
}

/** アンプ型式（必要ならモーター型式）から容量を推定（単独トークンの 20/40/80/160）。 */
export function deriveCapacity(ampModel = '', motorModel = '') {
  for (const src of [ampModel, motorModel]) {
    const s = String(src || '');
    if (!s) continue;
    for (const n of [...CAP_NUMS].sort((a, b) => String(b).length - String(a).length)) {
      if (new RegExp(`(?<!\\d)${n}(?!\\d)`).test(s)) return `${n}A`;
    }
  }
  return '';
}

/**
 * モーター1軸の必要容量を決める（優先: ①手入力capacity ②型式番手の標準判定）。
 * 戻り値: { capacity, voltage, dd, source }。capacity 未決なら capacity=''（要手入力）。
 */
/** モーター一覧(登録)から、型式一致の上書き設定を返す。全角/大小/空白ゆれ吸収。FANUC以外の手動登録に使う。 */
export function findMotorOverride(model, overrides) {
  const key = (s) => toHalfWidth(String(s || '')).replace(/[\s\-_]/g, '').toUpperCase();
  const m = key(model); if (!m || !Array.isArray(overrides)) return null;
  return overrides.find(o => o && o.model && key(o.model) === m) || null;
}

/** モーター型式の「自動判定」属性(登録による上書き前)。モーター一覧の表示に使う。 */
export function autoMotorAttrs(model) {
  return {
    capacity: standardCapacity(model),   // 番手→容量(FANUC αi/βiのみ。非FANUCは空=要手入力)
    voltage: motorVoltage(model),        // HV記載→400V / 型式あり→200V
    hv: isHV(model), dd: isDD(model), dAmp: isDAmp(model), b: isBMotor(model), batteryless: isBatteryless(model),
  };
}

export function resolveMotorAxis(motor = {}, opts = {}) {
  const model = String(motor.model || '');
  const ov = findMotorOverride(model, opts.motorOverrides);   // モーター一覧の登録(FANUC以外等)を優先
  const manual = normCap(motor.capacity);
  let capacity = manual;
  let source = manual ? '手入力' : '';
  if (!capacity && ov && normCap(ov.capacity)) { capacity = normCap(ov.capacity); source = 'モーター登録'; }
  if (!capacity) {
    const std = standardCapacity(model);
    if (std) { capacity = std; source = '標準(番手)'; }
  }
  const pick = (mv, ov2, auto) => (mv != null ? !!mv : (ov2 != null ? !!ov2 : auto));
  return {
    capacity,
    voltage: motor.voltage ? String(motor.voltage) : (ov && ov.voltage ? String(ov.voltage) : motorVoltage(model)),
    dd: pick(motor.dd, ov && ov.dd, isDD(model)),
    // D駆動=(D)アンプ専用。型式の -D 記号から自動判定、手動/登録フラグ(dAmp)があれば優先。
    dAmp: pick(motor.dAmp, ov && ov.dAmp, isDAmp(model)),
    batteryless: pick(motor.batteryless, ov && ov.batteryless, isBatteryless(model)),
    source,
    model,
  };
}

// ───────────────────────── 号機マスタ ─────────────────────────

export const AXES = ['X', 'Y', 'Z', 'A', 'B', 'C'];

/** 電圧表記が 400V 系か（'AV400V' / '400V' / '400' → true）。 */
export function is400V(voltage) {
  return /400/.test(String(voltage || ''));
}

/** 容量表記から数値(A)を取り出す（'80A'→80, '160A'→160, ''→NaN）。号機軸の実装容量とモーター要求の大小比較用。 */
export function ampNum(cap) {
  const m = String(cap == null ? '' : cap).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : NaN;
}

// ── サーボソフト版数（DD/-Bの号機適合を決める）──
//  市場調査(FANUC B-65270EN)で確認: ①CNC機種→サーボ系列の対応が正 ②文字が後ろの系列ほど新世代(90B<90C<…<90J<…<90M)。
//  0i-MF(Plus)=90M系(=新)/35i-B=90J系(=新)/31i-A=90E系/0i-MD=90C系/18i=90B系(=旧・DD不可)。
//  ⚠「-B付きDD(HV含む)は90J0以上が必要」はFANUC公開資料に版数明記なし＝現場知(清水指示)。号機マスタのCNC/サーボ欄のみを根拠に判定(別表から逆算しない)。
const SERVO_LETTER_RANK = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 9, K: 10, L: 11, M: 12 };
function cncNorm(ctl) { return String((ctl && ctl.cnc) || '').toUpperCase().replace(/[\s\-]/g, ''); }
/** 号機のサーボ系列を {letter,num} で返す。servo欄(例 '90C5/4.0')優先、無ければCNC機種から推定。 */
export function servoInfo(ctl) {
  // 先頭の系列文字を拾い、間の英字(例 90JC8 の C)は読み飛ばして版番号の数字に到達する。
  const m = String((ctl && ctl.servo) || '').match(/90\s*([A-Za-z])[A-Za-z]*\s*(\d+)/);
  if (m) return { letter: m[1].toUpperCase(), num: parseInt(m[2], 10) };
  const c = cncNorm(ctl);
  if (/35I/.test(c) || /0IMF/.test(c)) return { letter: 'J', num: 0 };   // 35i-B / 0i-MF(Plus) = 新世代(90J/90M)
  if (/31I/.test(c) || /32I/.test(c)) return { letter: 'E', num: 0 };    // 31i/32i-A = 90E系
  if (/0IMD/.test(c)) return { letter: 'C', num: 5 };                     // 0i-MD = 90C系(≥90C5)
  if (/18I|0IC|20I/.test(c)) return { letter: 'B', num: 0 };             // 18i/0i-C = 90B系(旧・DD不可)
  return null;
}
function servoGE(ctl, letter, num) {
  const i = servoInfo(ctl); if (!i) return false;
  const a = SERVO_LETTER_RANK[i.letter] || 0, b = SERVO_LETTER_RANK[letter] || 0;
  return a !== b ? a > b : i.num >= num;
}
/** -B無しDD(直駆動)を回せる号機か（現場の「D.D対応」欄＝なめらか補正いける機）。 */
export function canRunDd(ctl) { return (ctl && ctl.ddCapable === true) || servoGE(ctl, 'C', 5); }
/** -B付きDD(HV含む)を回せる号機か。
 *  ⚠真実の源は号機マスタの「-B用なめらか補正」欄(bCorr)のみ(清水確認: 現状の「なめらか補正」欄=-B付DDの可否そのもの)。
 *  CNC世代(35i-MB等)からの推定は使わない — 実データで bCorr○=32,33,34,35 だけであり、
 *  推定だと31/82/84(35i-MB)が誤って-B可になる(清水のRTT-221回答[33,34,35]と矛盾)。Excel欄が真実。 */
export function canRunBDd(ctl) { return !!(ctl && ctl.bCorr === true); }
/** モーター型式に -B(サーボ世代サフィックス)が付くか。例: DIS80/400HV-B, αiS12/4000HV-B, αiS4/5000-B。 */
export function isBMotor(model) {
  const s = toHalfWidth(model == null ? '' : model).replace(/\s+/g, '').toUpperCase();
  return /-B(?![0-9A-Z])/.test(s);
}

/** モーター型式にバッテリーレス識別(FANUCエンコーダ末尾の "BL"=数字直後。例 αiA4000BL)があれば true。
 *  ⚠「-B」(サーボ世代)や 先頭の"BL-…"(BLモータ型式)とは別。数字直後のBLのみ拾う。万能ではないのでモーター一覧で上書き可。 */
export function isBatteryless(model) {
  const s = toHalfWidth(model == null ? '' : model).replace(/\s+/g, '').toUpperCase();
  return /\dBL(?![A-Z0-9])/.test(s);
}

/** ○/×/true/false/1/0/空 を bool へ。○・有・true・1 を true とみなす。 */
function truthyMark(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return false;
  if (/^(×|x|no|false|0|不可|なし|-)$/i.test(s)) return false;
  return /^(○|◯|有|可|yes|true|1|対応|あり|o)$/i.test(s) || s === '○';
}

/**
 * 号機オブジェクトを正規化する。
 * 入力キー: unit/号機, cnc/CNCユニット, voltage/制御電圧, caps{X..C} または X容量..C容量,
 *          dDrive/-D駆動, bCorr/-Bなめらか補正, batteryless/バッテリーレス対応
 */
export function normController(raw = {}) {
  const caps = {};
  const amps = {};
  for (const a of AXES) {
    caps[a] = normCap(raw.caps ? raw.caps[a] : (raw[`${a}容量`] ?? raw[a]));
    amps[a] = String((raw.amps ? raw.amps[a] : raw[`${a}アンプ`]) || '').trim();
  }
  return {
    unit: String(raw.unit ?? raw['号機'] ?? '').trim(),
    cnc: String(raw.cnc ?? raw['CNCユニット'] ?? raw['CNC型式'] ?? '').trim(),
    ver: String(raw.ver ?? raw['Ver'] ?? '').trim(),
    voltage: String(raw.voltage ?? raw['制御電圧'] ?? '').trim(),
    servo: String(raw.servo ?? raw['SERVO'] ?? '').trim(),
    caps,
    amps,
    // D駆動 = (D)アンプを積んでいる号機（運転軸の"(D)"表記）。現場定義ではこれが「D駆動」。
    dDrive: raw.dDrive != null ? !!raw.dDrive : (AXES.some(a => String(amps[a]).toUpperCase() === 'D') || truthyMark(raw['-D駆動'])),
    // DDモーター駆動可 = 「D.D対応」(18号機以上)。DDテーブルを回せるかの能力（割当判定に使う）。
    ddCapable: raw.ddCapable != null ? !!raw.ddCapable : truthyMark(raw['D.D対応'] ?? raw['DDモーター駆動可'] ?? raw['-D駆動']),
    bCorr: raw.bCorr != null ? !!raw.bCorr : truthyMark(raw['-Bなめらか補正']),
    batteryless: raw.batteryless != null ? !!raw.batteryless : truthyMark(raw['バッテリーレス対応'] ?? raw['バッテリーレス']),
    // 転置マスタ由来の付帯情報（あれば保持・無ければ空）
    dept: String(raw.dept ?? raw['所有部門'] ?? '').trim(),
    equipmentNo: String(raw.equipmentNo ?? raw['設備No.'] ?? raw['設備No'] ?? '').trim(),
    note: String(raw.note ?? raw['備考'] ?? '').trim(),
  };
}

/** 容量が入っている（実装されている）軸の文字 [X,Y,...]。 */
export function controllerAxes(ctl) {
  return AXES.filter(a => ctl.caps && ctl.caps[a]);
}

/** need を満たせる号機の軸一覧(静的)。⚠(D)アンプ軸は -Dモーター(dAmp)専用＝相互排他:
 *    ・Dモーター(-D)は (D)アンプ軸にしか置けない ・普通のモーターは (D)アンプ軸に置けない。 */
export function usableAxesFor(ctl, need) {
  const cap = normCap(need && need.capacity);
  const wantD = !!(need && need.dAmp);
  const hasDAxis = AXES.some(a => String((ctl.amps || {})[a] || '').toUpperCase() === 'D');
  // 例外号機(改造でその型式のDモーターだけ可: 号機31/84等)。(D)軸は持たないので普通軸に容量で置ける。
  const isExceptionUnit = wantD && !hasDAxis && Array.isArray(need && need.dAmpExtraUnits) && need.dAmpExtraUnits.map(String).includes(String(ctl.unit));
  return controllerAxes(ctl).filter(a => {
    const isDAxis = String((ctl.amps || {})[a] || '').toUpperCase() === 'D';
    // 手動追加の号機(軸のアンプ種別情報なし)で dDrive=○ の場合は、全軸を(D)対応とみなすフォールバック
    //   (Excel取込号機はアンプ種別を持つので厳密な相互排他が効く)。
    if (wantD && !hasDAxis && ctl.dDrive === true) return true;
    // 例外号機: (D)軸が無くても普通軸に容量が合えば置ける(=配置先になる。これが無いと31/84に置けず全部32へ集中し取り合いになる=清水報告)。
    if (isExceptionUnit) { if (!cap) return true; const have = ampNum(ctl.caps[a]), req = ampNum(cap); return Number.isFinite(have) && Number.isFinite(req) ? have >= req : true; }
    if (isDAxis !== wantD) return false;
    // (D)アンプ軸は容量ゲートを適用しない: -Dモーターの番手→容量換算は(D)系アンプに合わず、
    //   実Excelは備考で「RTT-215,AB専用(=号機32)」等と専用機を明記している(計算40A vs 32のD軸80Aで弾くのは実態と矛盾)。
    if (wantD) return true;
    // 容量は「号機軸の実装容量 ≥ モーター要求容量」でOK(同電圧内)。⚠完全一致にすると
    //   HV(400V)で番手4→10A のモーターが 400V号機のX軸20A に乗らない誤判定になる(清水指摘: 200V=20A/400V=10Aの混同)。
    if (!cap) return true;
    const have = ampNum(ctl.caps[a]), req = ampNum(cap);
    return Number.isFinite(have) && Number.isFinite(req) ? have >= req : ctl.caps[a] === cap;
  });
}

/** 配置(予約)で押さえる候補軸。DD明示号機は普通軸、それ以外は usableAxesFor。 */
function candidateAxes(ctl, need) {
  const useUnits = Array.isArray(need.units) && need.units.length;
  if (useUnits && !need.dAmp) {
    const nonD = controllerAxes(ctl).filter(a => String((ctl.amps || {})[a] || '').toUpperCase() !== 'D');
    return nonD.length ? nonD : (controllerAxes(ctl).length ? controllerAxes(ctl) : [AXES[0]]);
  }
  return usableAxesFor(ctl, need);
}

/** この号機が1つの need（軸要求）を満たせる軸があるか。時間は考慮しない静的判定。 */
export function axisMatches(ctl, need) {
  if (!need) return false;
  // ⚠⚠電圧は絶対ゲート(最優先・全経路に適用)。
  //   200V↔400V(HV)を跨いだ割当は物理的にモーター/アンプを焼損する(清水指摘: 号機35はHV=400V。200Vモーターを載せるな)。
  //   need.voltage が空(=不明)のときだけ電圧不問。号機側は既定200V。
  const voltageClash = !!(need.voltage && is400V(need.voltage) !== is400V(ctl.voltage));
  // D.D.モーター仕様表の「駆動可能号機(units)」= 現場が保証した割当先。
  //   ただし電圧だけは安全のため必ず再確認し、焼損する号機(電圧不一致)は units に載っていても除外する。
  //   (DD表units と号機マスタ電圧の不整合は unitDiagnostics で別途フラグ化して人に見せる。)
  if (Array.isArray(need.units) && need.units.length) {
    if (voltageClash) return false;
    if (!need.units.map(String).includes(String(ctl.unit))) return false;
    if (need.batteryless && !ctl.batteryless) return false;   // BL要求はunits指定でも落とさない
    // ⚠-B/DD可否=物理ハード制約(清水確認: -B付きDDは「-B用なめらか補正」○の号機のみ)。unitsに古い号機が残っていても回せない号機には割り当てない。
    if (need.dd) return need.isB ? canRunBDd(ctl) : canRunDd(ctl);
    // ⚠-D((D)アンプ専用)モーターは units があっても(D)軸(または例外号機)の裏取りを外さない
    //   (unitsだけで通すと普通軸に予約され、(D)アンプ1本の取り合いが検出されなくなる)。
    if (need.dAmp) {
      if (ctl.dDrive === true && usableAxesFor(ctl, need).length > 0) return true;
      return Array.isArray(need.dAmpExtraUnits) && need.dAmpExtraUnits.includes(String(ctl.unit));
    }
    return true;
  }
  // 直駆動(DD=Dis/TSUDA)モーターで units が無い＝DD表に型式が見つからない(表記ゆれ疑い)。
  //   D.D対応へ勝手に置くと誤割当になるため、置かずに②(使える号機なし)へ理由付きで出す。
  if (need.dd) return false;
  // D駆動((D)アンプ)必須モーター(-D) → 同電圧の(D)アンプ軸を持つ号機のみ。
  //   200Vの-Dは号機32(200V+D)、400Vの-Dは号機35(400V+D)。逆に載せると焼損するので電圧ゲート必須。
  if (need.dAmp) {
    if (voltageClash) return false;
    if (need.batteryless && !ctl.batteryless) return false;
    if (ctl.dDrive === true && usableAxesFor(ctl, need).length > 0) return true;
    // 例外号機(改造で型式限定のDモーター可: RTT-213/215の号機31/84)。(D)軸は無いので電圧+容量だけで判定。
    if (Array.isArray(need.dAmpExtraUnits) && need.dAmpExtraUnits.includes(String(ctl.unit))) {
      const req = ampNum(need.capacity);
      if (!Number.isFinite(req)) return true;
      return AXES.some(a => { const h = ampNum(ctl.caps && ctl.caps[a]); return Number.isFinite(h) && h >= req; });
    }
    return false;
  }
  if (voltageClash) return false;
  if (need.batteryless && !ctl.batteryless) return false;
  return usableAxesFor(ctl, need).length > 0;
}

/**
 * DD表の駆動可能号機(units)と号機マスタの不整合を洗い出す(割当は変えず、人に見せて是正させるための診断)。
 * 戻り値: { voltageDrop:[unit], servoWarn:[unit] }
 *   voltageDrop: unitsに載っているが電圧不一致で焼損=割当から除外した号機。
 *   servoWarn : 電圧はOKだがサーボ版数がDD要件(-B→90J0 / 通常→90C5)に届かない号機(要確認)。
 */
export function unitDiagnostics(need, controllers) {
  const out = { voltageDrop: [], servoWarn: [] };
  if (!need || !Array.isArray(need.units) || !need.units.length) return out;
  const isB = !!need.isB;
  for (const u of need.units.map(String)) {
    const c = (controllers || []).find(x => String(x.unit) === u);
    if (!c) continue;
    if (need.voltage && is400V(need.voltage) !== is400V(c.voltage)) { out.voltageDrop.push(u); continue; }
    if (need.dd) { const ok = isB ? canRunBDd(c) : canRunDd(c); if (!ok) out.servoWarn.push(u); }
  }
  return out;
}

/**
 * DD需要に対し、号機マスタの物理属性(電圧/サーボ版数/容量)から駆動可能号機を推定する。
 * DD表 units が古い/欠落しているときの「推奨号機」。⚠DD(直駆動)は(D)アンプ軸にも載る(RTT-221が号機35で回る=清水確認)ため、軸のD印は不問で容量のみ見る。
 */
export function suggestDdUnits(need, controllers) {
  if (!need || !need.dd) return [];
  const req = ampNum(need.capacity);
  return (controllers || []).filter(c => {
    if (need.voltage && is400V(need.voltage) !== is400V(c.voltage)) return false;   // 電圧一致(焼損防止)
    if (!(need.isB ? canRunBDd(c) : canRunDd(c))) return false;                      // サーボ版数(-B→90J0 / 通常→90C5)
    if (Number.isFinite(req)) return AXES.some(a => { const h = ampNum(c.caps && c.caps[a]); return Number.isFinite(h) && h >= req; });
    return true;
  }).map(c => String(c.unit));
}

/** need を満たせる号機の一覧（静的・時間非考慮）。 */
export function qualifyingControllers(controllers, need) {
  return (controllers || []).filter(c => axisMatches(c, need));
}

// ───────────────────────── 指図の軸要求 ─────────────────────────

/**
 * 指図(lot)の制御装置スペックから軸要求リストを作る。
 * lot.controlSpec = { axes: [ { model, capacity, voltage, dd, batteryless, label } ], leadDays? }
 * 旧: axes 無しで単一 motor のときも許容。
 * 戻り値: [ { capacity, voltage, dd, batteryless, model, label } ]
 */
/** モーター型式が D.D.モーター仕様表(motorSpecs)にあれば、その1件を返す。
 *  照合は大文字化＋空白/ハイフン/アンダースコア無視(isDD等の正規化と揃える)＝手入力の大小/空白ゆれに強い。 */
export function findMotorSpecByModel(model, motorSpecs) {
  // 全角(αｉS12)と半角(αis12)、空白/ハイフンのゆれを吸収してから照合。
  const key = (s) => toHalfWidth(String(s || '')).replace(/[\s\-_]/g, '').toUpperCase();
  const m = key(model);
  if (!m) return null;
  const specs = motorSpecs || [];
  // ①完全一致。無ければ ②表の型式が登録型式の先頭一致（登録側は「モーター/エンコーダ」形＝末尾にエンコーダが付くため）。
  return specs.find(ms => ms.motorModel && key(ms.motorModel) === m)
    || specs.find(ms => { const k = key(ms.motorModel); return k.length >= 4 && m.startsWith(k); })
    || null;
}

// ── (D)アンプモーターの「例外号機」──
//  号機32=一般の(D)アンプ機(200V)。だが号機31/84は改造で「RTT-213/215のDモーターのときだけ」使える(清水確認)。
//  こうした型式限定の特別対応を settings.controlDAmpExceptions で足せるようにする(将来 別号機×別型式も追加可)。
export const DEFAULT_DAMP_EXCEPTIONS = [
  { units: ['31', '84'], productTypes: ['RTT-213', 'RTT-215'], note: 'D改造機(RTT-213/215のDモーターのみ可)' },
];
/** 型式(productModel)に対して、例外的にDモーターを載せられる号機一覧を返す。exceptions未設定(undefined)なら既定を使う。
 *  照合は正規化(normProductType)後に全角→半角+大文字化=「rtt-215」「ＲＴＴ-215」等の入力ゆれでも一致。 */
export function dAmpExtraUnitsFor(productModel, exceptions) {
  const key = (s) => toHalfWidth(String(normProductType(s) || '')).toUpperCase().trim();
  const pt = key(productModel);
  if (!pt) return [];
  const list = Array.isArray(exceptions) ? exceptions : DEFAULT_DAMP_EXCEPTIONS;
  const out = new Set();
  for (const ex of list) {
    const pts = (ex && Array.isArray(ex.productTypes) ? ex.productTypes : []).map(key);
    if (pts.includes(pt)) for (const u of (ex.units || [])) out.add(String(u));
  }
  return [...out];
}

export function lotAxisNeeds(lot, motorSpecs = [], opts = {}) {
  const spec = lot && lot.controlSpec;
  if (!spec) return [];
  const axes = Array.isArray(spec.axes) ? spec.axes : (spec.model ? [spec] : []);
  const productType = normProductType(lot && lot.model);
  const dAmpExtraUnits = dAmpExtraUnitsFor(lot && lot.model, opts.dAmpExceptions);
  return axes
    .map((ax, i) => {
      const r = resolveMotorAxis(ax, { motorOverrides: opts.motorOverrides });
      // モーター型式が「型式とモーターの特別対応表」(旧D.D.モーター仕様表)にあれば、表を真実の源として
      //   ・容量/電圧/駆動可能号機(units) ・フラグ(dd/dAmp/batteryless=表の上書き値) を反映。
      //   ⚠表は直駆動専用ではなくなった(普通モーターも登録可): 行の dd フラグが真実。
      //     レガシー行(ddフィールド無し)は旧D.D.表由来=全部直駆動なので dd!==false で true 扱い。
      const hit = findMotorSpecByModel(ax.model, motorSpecs);
      // D駆動((D)アンプ=号機32/35)判定: 表hit時は表のdAmpフラグ(明示trueのみ) > 明示フラグ(dAmp) >
      //   レガシー手動フラグ(dd=true だが直駆動でない=旧UIの「D駆動」チェックの意図) > 型式の -D 記号。
      //   ※dd(直駆動 Dis/TSUDA)とは別概念。混同すると「-DモーターがD.D対応23台のどれにでも付く」誤割当になる(清水指摘)。
      const dAmp = hit ? (hit.dAmp === true) : ((ax.dAmp != null) ? !!ax.dAmp
        : ((ax.dd === true && !isDD(ax.model)) ? true : r.dAmp));
      return {
        // ⚠容量は「特別対応表に書いてある値」を最優先（＝Excelの実数字）。
        //   表に無いモーターだけ番手からの計算値を使う。計算値でExcelの実数字を上書きしない。
        capacity: (hit && hit.capacity) ? hit.capacity : r.capacity,
        voltage: (ax.voltage ? r.voltage : (hit ? hit.voltage : r.voltage)),
        dd: hit ? (hit.dAmp === true ? false : hit.dd !== false) : r.dd, // 表hit=行のddフラグ(レガシー未定義は直駆動)。表無しはr.dd(モーター登録の上書き→自動判定)。dAmpとddは排他
        ddHit: !!hit, // ②の理由表示用: 表に型式は有る(が駆動号機欄が空) / 型式そのものが無い を区別
        isB: isBMotor(ax.model), // -B(サーボ世代)付きDD→「-B用なめらか補正」対応号機が必要(診断用)
        dAmp,
        // ⚠dAmp((D)アンプ)モーターの「駆動できる号機」は排他ホワイトリストにしない＝
        //   通常機(200V=32/400V=35)＋例外号機(設定)＋特別対応表のunits を全部“足す”(和集合)。
        //   (units排他にすると、表に31,84だけ書いた瞬間に通常機32が弾かれる誤り＝清水報告「RTT-215で32が消える」)
        dAmpExtraUnits: dAmp
          ? [...new Set([...(dAmpExtraUnits || []), ...((hit && Array.isArray(hit.units)) ? hit.units.map(String) : [])])]
          : undefined,
        productType,
        batteryless: (hit && hit.batteryless != null) ? !!hit.batteryless : r.batteryless,
        // 直駆動DDは units=排他(表が唯一の源)。dAmpは上の dAmpExtraUnits に合流させるので units は持たせない(=通常機32/35を残す)。
        units: dAmp ? undefined : ((hit && Array.isArray(hit.units) && hit.units.length) ? hit.units.map(String) : undefined),
        model: r.model,
        source: r.source,
        label: ax.label || `軸${i + 1}`,
      };
    })
    .filter(n => n.model || n.capacity || n.batteryless || n.dd || n.dAmp || is400V(n.voltage)); // 空行のみ除外(400V/DD/BL/Dだけの要求は残す)
}

/** 軸要求の「種別キー」= 容量|電圧|D|電池。取り合いは同一種別内で起きる。 */
export function needTypeKey(need) {
  // D駆動((D)ｱﾝﾌﾟ)は容量ゲートを使わないが、電圧(200V=32/400V=35)と例外号機で使える号機が変わるので種別を分ける。
  if (need.dAmp) return ['DAMP', is400V(need.voltage) ? '400V' : '200V',
    (Array.isArray(need.dAmpExtraUnits) && need.dAmpExtraUnits.length) ? 'x:' + need.dAmpExtraUnits.slice().sort().join(',') : '-',
    (Array.isArray(need.units) && need.units.length) ? 'u:' + need.units.map(String).slice().sort().join(',') : '-',
    need.batteryless ? 'BL' : '-'].join('|');
  return [
    normCap(need.capacity) || '?',
    is400V(need.voltage) ? '400V' : '200V',
    need.dd ? 'DD' : '-',
    need.batteryless ? 'BL' : '-',
    (Array.isArray(need.units) && need.units.length) ? 'u:' + need.units.map(String).slice().sort().join(',') : '-',
  ].join('|');
}

export function needTypeLabel(need) {
  // D駆動は容量表示を出さない(番手換算は(D)系アンプに適用しない=誤った数字を見せない)
  if (need.dAmp) {
    const parts = [is400V(need.voltage) ? 'D駆動((D)ｱﾝﾌﾟ・400V=号機35)' : 'D駆動((D)ｱﾝﾌﾟ・200V=号機32)'];
    if (Array.isArray(need.dAmpExtraUnits) && need.dAmpExtraUnits.length) parts.push('例外可:号機' + need.dAmpExtraUnits.join(','));
    if (need.batteryless) parts.push('バッテリーレス');
    return parts.join('・');
  }
  const parts = [normCap(need.capacity) || '容量?'];
  if (is400V(need.voltage)) parts.push('400V(HV)');
  const hasUnits = Array.isArray(need.units) && need.units.length > 0;
  if (need.dd) parts.push(hasUnits ? 'DD(直駆動)' : (need.ddHit ? 'DD(直駆動・駆動可能号機がDD表に未記載)' : 'DD(直駆動・DD表に型式なし=表記ゆれ?)'));
  if (need.batteryless) parts.push('バッテリーレス');
  return parts.join('・');
}

// ───────────────────────── 日付ユーティリティ ─────────────────────────

/** 'YYYY-MM-DD' → epoch(ms, ローカル0時)。不正なら null。 */
export function ymdToMs(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
  return isNaN(t) ? null : t;
}

/** epoch(ms) → 'YYYY-MM-DD'（ローカル）。 */
export function msToYmd(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DAY_MS = 86400000;

/** 指図の占有窓 [start,end]（納期基準: 納期 - leadDays 〜 納期）。納期無しは null。 */
export function lotWindow(lot, leadDays) {
  const due = ymdToMs(lot && lot.dueDate);
  if (due == null) return null;
  const lead = Math.max(0, Number(
    (lot.controlSpec && lot.controlSpec.leadDays != null) ? lot.controlSpec.leadDays : leadDays
  ) || 0);
  return { start: due - lead * DAY_MS, end: due, due, leadDays: lead };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd; // 端含む（同日でも重なり扱い）
}

// ───────────────────────── 割当 & 取り合い検出 ─────────────────────────

/**
 * 指図群を号機の軸へ貪欲に割り当て、取り合い(割当不能)を検出する。
 *
 * 手順: 納期の早い順に指図を見て、各軸要求を「その窓で空いている・適合する号機の軸」へ予約。
 * 置けない軸要求が1つでもあれば、その指図は conflict(取り合い) とする。
 *
 * @param lots  [{ id, orderNo, model, dueDate, controlSpec, ... }]
 * @param controllers  正規化済み号機配列
 * @param opts { leadDays=3, today }  today は 'YYYY-MM-DD'（納期近接判定の基準・既定は使わない）
 * @returns {
 *   assignments: [{ lotId, orderNo, unit, axis, capacity, start, end, due, need }],
 *   byController: { [unit]: { [axis]: [assignment...] } },
 *   conflicts: [{ lotId, orderNo, model, due, unmet: [{ need, qualifyingCount }] }],
 *   ampleNeeds, scarceNeeds, horizon: {start,end}
 * }
 */
export function buildAllocation(lots, controllers, opts = {}) {
  const leadDays = opts.leadDays != null ? opts.leadDays : 3;
  const motorSpecs = opts.motorSpecs || [];
  const ctls = (controllers || []).map(c => (c && c.caps ? c : normController(c)));

  // 対象 = controlSpec があり納期があり軸要求のある指図。完了は除く(opts.includeCompleted で含める)
  const items = [];
  for (const lot of lots || []) {
    if (!opts.includeCompleted && (lot.status === 'completed' || lot.location === 'completed')) continue;
    const win = lotWindow(lot, leadDays);
    if (!win) continue;
    const needs = lotAxisNeeds(lot, motorSpecs, { dAmpExceptions: opts.dAmpExceptions, motorOverrides: opts.motorOverrides });
    if (!needs.length) continue;
    items.push({ lot, win, needs });
  }
  items.sort((a, b) => a.win.due - b.win.due || String(a.lot.orderNo).localeCompare(String(b.lot.orderNo)));

  // 号機×軸の予約帳: busy[unit][axis] = [{start,end,lotId}]
  const busy = {};
  for (const c of ctls) { busy[c.unit] = {}; for (const a of AXES) busy[c.unit][a] = []; }

  const isFree = (unit, axis, start, end) =>
    (busy[unit] && busy[unit][axis] || []).every(iv => !overlaps(start, end, iv.start, iv.end));

  const assignments = [];
  const conflicts = [];
  // lotId → 表示メタ（取り合い相手を名指しするため）
  const lotMeta = {};
  for (const it of items) lotMeta[it.lot.id] = { orderNo: it.lot.orderNo || '', model: it.lot.model || '', due: it.win.due, start: it.win.start, end: it.win.end };

  const mkAsg = (c, need, axis, win, lot) => {
    const useUnits = Array.isArray(need.units) && need.units.length;
    busy[c.unit][axis].push({ start: win.start, end: win.end, lotId: lot.id });
    return { lotId: lot.id, orderNo: lot.orderNo || '', model: lot.model || '', unit: c.unit, axis, capacity: useUnits ? (normCap(need.capacity) || 'DD') : c.caps[axis], start: win.start, end: win.end, due: win.due, need };
  };

  for (const it of items) {
    const { lot, win, needs } = it;
    const placed = [];
    const unmet = [];
    // 号機探索順: -D(dAmp)を含む指図は改造機(31/84)を先に(32/35を空けておく)。
    const anyDAmp = needs.some(n => n.dAmp);
    const searchCtls = anyDAmp
      ? [...ctls].sort((a, b) => {
        const da = AXES.some(x => String((a.amps || {})[x] || '').toUpperCase() === 'D') ? 1 : 0;
        const dbb = AXES.some(x => String((b.amps || {})[x] || '').toUpperCase() === 'D') ? 1 : 0;
        return da - dbb || ((Number(a.unit) || 0) - (Number(b.unit) || 0));
      })
      : ctls;

    // ① 両軸co-location: 2軸以上の指図は「同じ号機の別々の空き軸」に全軸を載せられる号機を優先(1台で両軸)。
    let coUnit = null, coAssign = null;
    if (needs.length >= 2) {
      for (const c of searchCtls) {
        if (!needs.every(n => axisMatches(c, n))) continue;
        const used = new Set(); const assign = []; let okAll = true;
        for (const n of needs) {
          const a = candidateAxes(c, n).find(ax => !used.has(ax) && isFree(c.unit, ax, win.start, win.end));
          if (a == null) { okAll = false; break; }
          used.add(a); assign.push({ need: n, axis: a });
        }
        if (okAll) { coUnit = c; coAssign = assign; break; }
      }
    }
    if (coUnit) {
      for (const { need, axis } of coAssign) { const asg = mkAsg(coUnit, need, axis, win, lot); assignments.push(asg); placed.push(asg); }
      continue; // この指図は1台に集約完了
    }

    // ② 軸ごと貪欲(co-locationできない/1軸のみ)。同じ号機に寄せられるならまず既に置いた号機を試す。
    for (const need of needs) {
      const cap = normCap(need.capacity);
      let chosen = null;
      const useUnits = Array.isArray(need.units) && need.units.length; // DD表由来の明示号機
      // 既に同指図の他軸を置いた号機を先頭に試す(できるだけ寄せる)。
      const placedUnits = [...new Set(placed.map(p => String(p.unit)))];
      const order = [...searchCtls].sort((a, b) => (placedUnits.includes(String(b.unit)) ? 1 : 0) - (placedUnits.includes(String(a.unit)) ? 1 : 0));
      for (const c of order) {
        if (!axisMatches(c, need)) continue;
        const cand = candidateAxes(c, need);
        for (const a of cand) {
          if (isFree(c.unit, a, win.start, win.end)) {
            chosen = { unit: c.unit, axis: a, capacity: useUnits ? (normCap(need.capacity) || 'DD') : c.caps[a] };
            break;
          }
        }
        if (chosen) break;
      }
      if (chosen) {
        busy[chosen.unit][chosen.axis].push({ start: win.start, end: win.end, lotId: lot.id });
        const asg = {
          lotId: lot.id, orderNo: lot.orderNo || '', model: lot.model || '',
          unit: chosen.unit, axis: chosen.axis, capacity: chosen.capacity,
          start: win.start, end: win.end, due: win.due, need,
        };
        assignments.push(asg);
        placed.push(asg);
      } else {
        // 置けなかった＝取り合い。相手を名指しする：この need を満たせる号機ごとに、
        //   この指図の窓を塞いでいる予約(=先に押さえた指図)を集める。
        const quals = qualifyingControllers(ctls, need);
        const rivals = [];
        for (const c of quals) {
          const nonD2 = controllerAxes(c).filter(a2 => String((c.amps || {})[a2] || '').toUpperCase() !== 'D');
          const axesToCheck = (Array.isArray(need.units) && need.units.length && !need.dAmp)
            ? (nonD2.length ? nonD2 : (controllerAxes(c).length ? controllerAxes(c) : [AXES[0]]))
            : usableAxesFor(c, need);
          for (const a of axesToCheck) {
            for (const iv of (busy[c.unit] && busy[c.unit][a] || [])) {
              if (iv.lotId !== lot.id && overlaps(win.start, win.end, iv.start, iv.end)) {
                rivals.push({
                  unit: c.unit, axis: a,
                  blocker: lotMeta[iv.lotId] || { orderNo: '?', model: '', due: iv.end, start: iv.start, end: iv.end },
                  overlapStart: Math.max(win.start, iv.start),
                  overlapEnd: Math.min(win.end, iv.end),
                });
              }
            }
          }
        }
        unmet.push({ need, qualifyingCount: quals.length, rivals });
      }
    }
    if (unmet.length) {
      conflicts.push({
        lotId: lot.id, orderNo: lot.orderNo || '', model: lot.model || '',
        due: win.due, start: win.start, end: win.end, placed, unmet,
      });
    }
  }

  // 取り合い明細（フラット）: 号機ごとに「blocker(先に押さえた指図) ⇔ blocked(置けなかった指図)」を1件に集約。
  //   これで「どの号機を・どの指図とどの指図が・いつ取り合っているか」が名指しできる。
  const contentions = [];
  for (const cf of conflicts) {
    for (const u of cf.unmet) {
      if (!(u.rivals && u.rivals.length)) continue;
      const byUnit = {};
      for (const r of u.rivals) {
        const dur = r.overlapEnd - r.overlapStart;
        if (!byUnit[r.unit] || dur > (byUnit[r.unit].overlapEnd - byUnit[r.unit].overlapStart)) byUnit[r.unit] = r;
      }
      for (const r of Object.values(byUnit)) {
        contentions.push({
          unit: r.unit, axis: r.axis, need: u.need,
          blocked: { orderNo: cf.orderNo, model: cf.model, due: cf.due, start: cf.start, end: cf.end },
          blocker: r.blocker,
          overlapStart: r.overlapStart, overlapEnd: r.overlapEnd,
        });
      }
    }
  }

  // byController 集計
  const byController = {};
  for (const c of ctls) { byController[c.unit] = {}; for (const a of AXES) byController[c.unit][a] = []; }
  for (const asg of assignments) byController[asg.unit][asg.axis].push(asg);

  // 種別ごとの余裕/希少（使える号機が4台以上=余裕）
  const typeMap = new Map();
  for (const it of items) {
    for (const need of it.needs) {
      const key = needTypeKey(need);
      if (!typeMap.has(key)) {
        typeMap.set(key, { key, label: needTypeLabel(need), need, qualifyingCount: qualifyingControllers(ctls, need).length, demandCount: 0 });
      }
      typeMap.get(key).demandCount += 1;
    }
  }
  const AMPLE_THRESHOLD = opts.ampleThreshold != null ? opts.ampleThreshold : 4;
  const ampleNeeds = [], scarceNeeds = [];
  for (const t of typeMap.values()) (t.qualifyingCount >= AMPLE_THRESHOLD ? ampleNeeds : scarceNeeds).push(t);

  // 水平線（ガント表示範囲）
  let hStart = Infinity, hEnd = -Infinity;
  for (const it of items) { hStart = Math.min(hStart, it.win.start); hEnd = Math.max(hEnd, it.win.end); }
  const horizon = items.length ? { start: hStart, end: hEnd } : null;

  return {
    assignments, byController, conflicts, contentions,
    ampleNeeds, scarceNeeds,
    types: [...typeMap.values()],
    horizon, leadDays, itemCount: items.length,
  };
}

/**
 * 指図(orderNo)の割当結果を作業者向けに1件に要約する（カードバッジ/準備カード共用の純関数）。
 * buildAllocation の戻り値(alloc)から、その指図の「使う号機・軸ごと・状態・取り合い相手」をまとめる。
 * 戻り値: null(=軸要求なし=モーター未登録) | {
 *   state: 'ok'|'contention'|'partial'|'none',  // ok=すんなり / contention=取り合い(置けず) / partial=一部の軸だけ置けた / none=使える号機なし
 *   units: ['33'],           // 置けた号機(重複排除)
 *   both: true,              // 2軸以上を1台に集約できた(両軸)
 *   perAxis: [{label:'回転軸', unit:'31', model, capacity, voltage, usableUnits:['31','33']}], // 置けた軸→号機(usableUnits=使える号機ぜんぶ)
 *   unmetAxes: [{label:'傾斜軸', model, capacity, voltage, reason, units, rivalOrders, usableUnits}],
 *   model,                   // 型式(表示補助)
 * }
 * @param controllers 省略可。渡すと軸ごとに usableUnits（そのモーターを焼損せず回せる号機ぜんぶ）を付ける。
 */
export function summarizeOrderAllocation(alloc, orderNo, controllers = null) {
  if (!alloc || orderNo == null || orderNo === '') return null;
  const key = String(orderNo);
  const asg = (alloc.assignments || []).filter(a => String(a.orderNo) === key);
  const conf = (alloc.conflicts || []).find(c => String(c.orderNo) === key);
  if (!asg.length && !conf) return null; // この指図には軸要求が無い（＝モーター未登録の製品）
  const usableFor = (need) => (controllers && need) ? qualifyingControllers(controllers, need).map(c => String(c.unit)) : [];
  const perAxis = asg.map(a => ({
    label: (a.need && a.need.label) || a.axis || '',
    unit: String(a.unit),
    model: (a.need && a.need.model) || a.model || '',
    capacity: (a.need && (Array.isArray(a.need.units) && a.need.units.length ? (normCap(a.need.capacity) || 'DD') : a.need.capacity)) || a.capacity || '',
    voltage: (a.need && a.need.voltage) || '',
    usableUnits: usableFor(a.need),
  }));
  const units = [...new Set(asg.map(a => String(a.unit)))];
  const both = units.length === 1 && asg.length >= 2;
  const unmet = conf ? (conf.unmet || []) : [];
  const unmetAxes = unmet.map(u => {
    const hasRivals = !!(u.rivals && u.rivals.length);
    return {
      label: (u.need && u.need.label) || '',
      model: (u.need && u.need.model) || '',
      capacity: (u.need && u.need.capacity) || '',
      voltage: (u.need && u.need.voltage) || '',
      reason: hasRivals ? 'contention' : 'none',
      units: hasRivals ? [...new Set(u.rivals.map(r => String(r.unit)))] : [],
      rivalOrders: hasRivals ? [...new Set(u.rivals.map(r => r.blocker && r.blocker.orderNo).filter(Boolean).map(String))] : [],
      usableUnits: usableFor(u.need),
    };
  });
  let state;
  if (!unmetAxes.length) state = 'ok';
  else if (asg.length) state = 'partial';
  else if (unmetAxes.every(u => u.reason === 'contention')) state = 'contention';
  else state = 'none';
  const model = (asg[0] && asg[0].model) || (conf && conf.model) || '';
  return { state, units, both, perAxis, unmetAxes, model };
}

/** 1本のモーター型式を、焼損せず回せる号機ぜんぶ（qualifyingControllers 経由＝電圧/容量/DD/-B/D 全ゲート適用）。
 *  productModel=型式(例外号機の型式限定判定に使う)。台帳からの「仮モーター」候補や、軸ごとの使える号機の算出に使う。 */
export function usableUnitsForMotor(controllers, productModel, motorModel, opts = {}, voltage = '', capacity = '') {
  if (!motorModel) return [];
  const ax = { model: motorModel };
  if (voltage) ax.voltage = voltage;     // ⚠申告電圧を優先(型式文字列からの誤導出を防ぐ=200V↔400V焼損防止)
  if (capacity) ax.capacity = capacity;  // 申告容量を優先(容量ゲートを正しく効かせる)
  const needs = lotAxisNeeds(
    { model: productModel || '', controlSpec: { axes: [ax] } },
    opts.motorSpecs || [],
    { dAmpExceptions: opts.dAmpExceptions, motorOverrides: opts.motorOverrides }
  );
  if (!needs.length) return [];
  return qualifyingControllers(controllers || [], needs[0]).map(c => String(c.unit));
}

/** 「社内の仮モーター在庫(spares)」から、この need(軸要求)の代わりに使えるものだけ返す。
 *  ⚠焼損防止: 「その軸(need)を回せる号機」∩「仮モーターを"申告電圧/容量込み"で回せる号機」の共通集合が有るものだけ。
 *    → 表示する号機は必ず元の需要の電圧/容量/種別ゲートを満たす(型式名だけの一致で通さない=清水の焼損教訓)。
 *  ⚠回せないモーターは出さない(清水指摘: 回せないモーター情報があっても困る)。 */
export function matchSpareMotorsForNeed(spares, need, controllers, opts = {}, productModel = '') {
  if (!Array.isArray(spares) || !need) return [];
  const needUnits = new Set(qualifyingControllers(controllers || [], need).map(c => String(c.unit)));
  if (!needUnits.size) return []; // この軸を回せる号機が無い=仮モーターを勧めても意味なし
  const nk = (s) => toHalfWidth(String(s || '')).replace(/[\s\-_]/g, '').toUpperCase();
  const needModelKey = nk(need.model);
  const out = [];
  for (const s of spares) {
    if (!s || !s.motorModel) continue;
    const sModel = s.motorModel;
    // 仮モーターを、その"申告"電圧/容量込みで焼損せず回せる号機(model文字列からの誤導出を使わない)
    const spareUnits = usableUnitsForMotor(controllers, productModel || need.model, sModel, opts, s.voltage, s.capacity);
    const both = spareUnits.filter(u => needUnits.has(String(u))); // ∩ この軸を回せる号機
    if (!both.length) continue; // 代替できない(電圧/容量/種別不一致)なら出さない=焼損回避
    const s400 = s.voltage ? is400V(s.voltage) : isHV(sModel);
    const sameModel = !!needModelKey && nk(sModel) === needModelKey;
    out.push({ motorModel: sModel, capacity: normCap(s.capacity) || standardCapacity(sModel) || '', voltage: s.voltage || (s400 ? 'AC400V' : 'AC200V'), group: s.group || '', qty: s.qty || 1, note: s.note || '', usableUnits: both, sameModel });
  }
  return out.sort((a, b) => (b.sameModel ? 1 : 0) - (a.sameModel ? 1 : 0));
}

/** モーター型式(motorModel)の代わりに使える社内の仮モーターを返す(need を組んで matchSpareMotorsForNeed)。
 *  準備カード(登録済み軸)と過去実績カード(未登録)の両方で共用。 */
export function inHouseSparesForMotor(spares, productModel, motorModel, controllers, opts = {}) {
  if (!Array.isArray(spares) || !spares.length || !motorModel) return [];
  const needs = lotAxisNeeds({ model: productModel || '', controlSpec: { axes: [{ model: motorModel }] } }, opts.motorSpecs || [], { dAmpExceptions: opts.dAmpExceptions, motorOverrides: opts.motorOverrides });
  if (!needs.length) return [];
  return matchSpareMotorsForNeed(spares, needs[0], controllers, opts, productModel);
}

/** 日付文字列を YYYY-MM-DD に正規化（2026/8/15・2026.8.15 等も吸収）。台帳の月/窓フィルタが効くように。 */
export function normalizeYmd(s) {
  const t = String(s == null ? '' : s).trim(); if (!t) return '';
  const m = t.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return t;
  const p = n => String(n).padStart(2, '0');
  return `${m[1]}-${p(m[2])}-${p(m[3])}`;
}

/** order_motors ドキュメント → 実績台帳(motor_ledger)レコード。型式↔モーター↔号機↔指図↔日付を残す“別枠DB”用。 */
export function ledgerRecordFromOrderMotor(om, dateStr, usedUnitsByLabel = {}) {
  if (!om || !om.orderNo) return null;
  const axes = (Array.isArray(om.axes) ? om.axes : []).filter(a => a && (a.model || a.capacity)).map((a, i) => ({
    label: a.label || `軸${i + 1}`,
    motorModel: a.model || '',
    capacity: a.capacity || '',
    voltage: a.voltage || '',
  }));
  const rec = { orderNo: String(om.orderNo), model: om.model || '', axes, source: 'order_motors' };
  // ⚠date/usedUnits は「値が有るときだけ」載せる。空で載せると merge:true が既存の日付/手入力号機実績を潰す(清水: 台帳は消えない約束)。
  const nd = normalizeYmd(dateStr);
  if (nd) rec.date = nd;
  const uu = Object.entries(usedUnitsByLabel || {}).filter(([, u]) => u != null && u !== '').map(([label, unit]) => ({ label, unit: String(unit) }));
  if (uu.length) rec.usedUnits = uu;
  return rec;
}

/** モーター型式→作業者に見せるタグ配列。-B は割当に効くDDのときだけ付ける(清水指摘: 意味のないタグは出さない)。 */
export function motorBadgeTags(model) {
  const out = [];
  if (isHV(model)) out.push('HV');
  if (isDD(model)) out.push('DD');
  if (isDAmp(model)) out.push('D');
  if (isBMotor(model) && isDD(model)) out.push('-B');
  if (isBatteryless(model)) out.push('BL');
  return out;
}

/**
 * CSV(制御装置マスタ)テキスト → 正規化号機配列。
 * ヘッダ: 号機,CNCユニット,Ver,制御電圧,SERVO,X容量..C容量,Xアンプ..Cアンプ,-Bなめらか補正,-D駆動,(バッテリーレス対応)
 */
export function parseControllerCsv(text) {
  const rows = parseCsvRows(String(text || ''));
  if (!rows.length) return [];
  const header = rows[0].map(h => String(h || '').trim());
  const col = {};
  header.forEach((h, i) => { col[h] = i; });
  const idxOf = (...names) => { for (const n of names) if (col[n] != null) return col[n]; return -1; };
  const cellRaw = (row, i) => (i >= 0 && i < row.length ? String(row[i]).trim() : '');
  const iUnit = idxOf('号機', '機番');
  const out = [];
  for (const row of rows.slice(1)) {
    const unit = cellRaw(row, iUnit);
    if (!unit) continue;
    const caps = {}; const amps = {};
    for (const a of AXES) { caps[a] = cellRaw(row, idxOf(`${a}容量`)); amps[a] = cellRaw(row, idxOf(`${a}アンプ`)); }
    out.push(normController({
      unit,
      cnc: cellRaw(row, idxOf('CNCユニット', 'CNC')),
      ver: cellRaw(row, idxOf('Ver')),
      voltage: cellRaw(row, idxOf('制御電圧', '電圧')),
      servo: cellRaw(row, idxOf('SERVO')),
      caps, amps,
      '-D駆動': cellRaw(row, idxOf('-D駆動', 'D駆動')),
      '-Bなめらか補正': cellRaw(row, idxOf('-Bなめらか補正', '-B用なめらか補正', 'なめらか補正')),
      'バッテリーレス対応': cellRaw(row, idxOf('バッテリーレス対応', 'バッテリーレス')),
    }));
  }
  return out;
}

// ───────────────────────── 転置マスタ（FANUC生産課Excel）パーサ ─────────────────────────
// 実ファイル「生産課FANUC制御装置」は号機を「列」に並べた転置表 + 別表「D.D.モーター仕様」。
// これを号機マスタ（controllers）と モーター仕様参照（motorSpecs）へ変換する純関数。

const CTL_LABELS = ['号機', '設備No.', '設備No', 'CNC型式', '所有部門', '主な使用班', '運転軸', 'ｻｰﾎﾞ版数', 'サーボ版数', 'D.D 対応', 'D.D対応', 'DD対応', 'なめらか補正', '備考'];
const isKnownLabel = (s) => { const t = String(s == null ? '' : s).trim(); return CTL_LABELS.some(l => t === l); };
const cellStr = (row, i) => (row && i >= 0 && i < row.length) ? String(row[i] == null ? '' : row[i]).trim() : '';
const firstField = (fields, ...names) => { for (const n of names) if (fields[n]) return fields[n]; return null; };

/** 軸セル "X  40A" / "X 40A(B)" → {axis,cap,ampType} | null（先頭が軸文字 X..C の時のみ）。 */
export function parseAxisCell(cell) {
  // 全角英数(Ｘ40Ａ)や小文字(x 40a)の表記ゆれを半角大文字へ正規化してから判定。
  const s = String(cell == null ? '' : cell).trim().replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).toUpperCase();
  if (!s) return null;
  const m = s.match(/^([XYZABC])\s*[:：]?\s*(\d+)\s*A?\s*(?:[（(]\s*([A-Z]+)\s*[)）])?/);
  if (!m) return null;
  const n = parseInt(m[2], 10);
  if (!(n > 0)) return null; // '0A' 等のプレースホルダは軸なし扱い(存在しないアンプを空き軸と誤認しない)
  return { axis: m[1], cap: `${n}A`, ampType: m[3] || '' };
}

/** "18号機、22号機、23号機" → ['18','22','23']（新規①等は無視）。 */
export function parseUnitsFromText(text) {
  const out = []; const re = /(\d+)\s*号機/g; let m;
  while ((m = re.exec(String(text || '')))) out.push(m[1]);
  return out;
}

/** 型式文字列 → 正規化 productType "RTT-311"（"RTT-311,…" 等から基幹を取る）。 */
export function normProductType(s) {
  const m = String(s || '').toUpperCase().match(/(RT[TH])\s*-?\s*(\d+)/);
  return m ? `${m[1]}-${m[2]}` : String(s || '').trim();
}

/**
 * 転置レイアウトの1シート(rows=二次元配列) を解析。
 * 戻り値: { controllers:[{unit,cnc,dept,equipmentNo,servo,caps,amps,dDrive,bCorr,batteryless,note,voltage}], motorSpecs:[...] }
 * ※ voltage は「備考に400V」または「型式400V」だけを一次判定（駆動号機クロス補完は mergeControllerParse で全体後付け）。
 */
export function parseControllerMatrix(rows) {
  const R = (rows || []).map(r => Array.isArray(r) ? r : []);
  const controllers = [];
  const motorSpecs = [];

  // ── 号機ブロック（'号機' セルのある行ごと） ──
  let i = 0;
  while (i < R.length) {
    const labelCol = R[i].findIndex(c => String(c == null ? '' : c).trim() === '号機');
    if (labelCol < 0) { i++; continue; }
    const unitCols = [];
    for (let c = labelCol + 1; c < R[i].length; c++) { const u = cellStr(R[i], c); if (u) unitCols.push({ c, unit: u }); }

    const fields = {};       // label -> row
    const axisRows = [];     // 運転軸ブロックの行
    const noteRows = [];     // 備考ブロックの行（複数行にまたがる：ﾊﾞｯﾃﾘｰﾚｽ可 等は2行目にある）
    let inAxes = false, inNote = false;
    let j = i + 1;
    for (; j < R.length; j++) {
      const lbl = cellStr(R[j], labelCol);
      if (lbl === '号機') break;                                   // 次ブロック
      const hasType = R[j].some(c => String(c == null ? '' : c).trim() === '型式');
      const hasDrive = R[j].some(c => String(c == null ? '' : c).trim() === '駆動装置');
      if (hasType && hasDrive) break;                              // DDモーター表へ
      if (lbl === '運転軸') { inAxes = true; inNote = false; axisRows.push(R[j]); continue; }
      if (lbl === '備考') { inNote = true; inAxes = false; fields[lbl] = R[j]; noteRows.push(R[j]); continue; }
      if (isKnownLabel(lbl)) { inAxes = false; inNote = false; fields[lbl] = R[j]; continue; }
      if (inNote) { noteRows.push(R[j]); continue; }               // 備考の続き行（ﾊﾞｯﾃﾘｰﾚｽ可 等）
      if (inAxes) { axisRows.push(R[j]); continue; }               // 軸の続き（ラベル欄が注記のこともある）
    }

    for (const { c, unit } of unitCols) {
      const caps = {}, amps = {};
      for (const ar of axisRows) {
        const p = parseAxisCell(cellStr(ar, c));
        if (p && !caps[p.axis]) { caps[p.axis] = p.cap; if (p.ampType) amps[p.axis] = p.ampType; }
      }
      const note = noteRows.map(nr => cellStr(nr, c)).filter(Boolean).join(' ');
      const cnc = (() => { const f = firstField(fields, 'CNC型式'); return f ? cellStr(f, c) : ''; })();
      const dept = (() => { const f = firstField(fields, '所有部門', '主な使用班'); return f ? cellStr(f, c) : ''; })();
      const equipmentNo = (() => { const f = firstField(fields, '設備No.', '設備No'); return f ? cellStr(f, c) : ''; })();
      const servo = (() => { const f = firstField(fields, 'ｻｰﾎﾞ版数', 'サーボ版数'); return f ? cellStr(f, c) : ''; })();
      const ddF = firstField(fields, 'D.D 対応', 'D.D対応', 'DD対応');
      // 「D.D対応」行の○ = DDモーター駆動可(18号機以上)。能力であって「D駆動」ではない。
      const ddCapable = ddF ? /[○◯]/.test(cellStr(ddF, c)) : false;
      // D駆動 = (D)アンプを積んでいる号機だけ（運転軸の"(D)"表記。現場定義）。
      const dDrive = AXES.some(a => String(amps[a]).toUpperCase() === 'D');
      const bF = firstField(fields, 'なめらか補正');
      const bCorr = bF ? /[○◯]/.test(cellStr(bF, c)) : false;
      if (!Object.keys(caps).length && !cnc && !servo) continue;   // 空列スキップ
      controllers.push({
        unit, cnc, dept, equipmentNo, servo, caps, amps, dDrive, ddCapable, bCorr,
        // 備考の「バッテリーレス」(全角)/「ﾊﾞｯﾃﾘｰﾚｽ」(半角)/「BL」いずれも拾う（半角・BLを取りこぼしていたバグ修正）
        batteryless: /バッテリーレス|ﾊﾞｯﾃﾘｰﾚｽ|BL/i.test(note),
        note,
        voltage: /400\s*V/i.test(note) ? 'AC400V' : '',
      });
    }
    i = j;
  }

  // ── D.D.モーター仕様表（'型式' と '駆動装置' を含む行がヘッダ） ──
  const hi = R.findIndex(r => r.some(c => String(c == null ? '' : c).trim() === '型式') && r.some(c => String(c == null ? '' : c).trim() === '駆動装置'));
  if (hi >= 0) {
    const hdr = R[hi];
    const colOf = (name) => hdr.findIndex(c => String(c == null ? '' : c).trim() === name);
    const cType = colOf('型式'), cAxis = colOf('軸'), cModel = colOf('モーター型式'), cCap = colOf('容量'), cDrive = colOf('駆動装置');
    let curType = '';
    for (let r = hi + 1; r < R.length; r++) {
      const row = R[r];
      const t = cellStr(row, cType); if (t) curType = t;
      const axisKind = cellStr(row, cAxis);
      const model = cellStr(row, cModel);
      const cap = cellStr(row, cCap);
      const drive = cellStr(row, cDrive);
      if (!model && !cap) continue;
      let voltage = '';
      for (const cell of row) { const mm = String(cell == null ? '' : cell).match(/(\d{3})\s*V/); if (mm) { voltage = `AC${mm[1]}V`; break; } }
      if (!voltage) voltage = isHV(model) ? 'AC400V' : 'AC200V';
      motorSpecs.push({
        productType: normProductType(curType),
        axisKind: axisKind || '',
        motorModel: model,
        capacity: normCap(cap),
        voltage,
        units: parseUnitsFromText(drive),
      });
    }
  }
  return { controllers, motorSpecs };
}

/**
 * 複数シートの parseControllerMatrix 結果をマージ。
 * ・controllers: unit重複は「容量が入っている軸が多い方」を採用。
 * ・voltage: 未確定(空/AC200V)の号機は、400V DDモーターの駆動号機一覧にあれば AC400V へ昇格。
 */
export function mergeControllerParse(results) {
  const byUnit = new Map();
  const motorSpecs = [];
  for (const res of (results || [])) {
    for (const c of (res.controllers || [])) {
      const key = String(c.unit);
      const score = Object.keys(c.caps || {}).length;
      const prev = byUnit.get(key);
      if (!prev || score > prev._score) byUnit.set(key, { ...c, _score: score });
    }
    for (const ms of (res.motorSpecs || [])) motorSpecs.push(ms);
  }
  // ⚠ 号機の電圧は、その号機の欄(備考の「400V専用」等)に書いてあるものだけを使う。
  //   他の表(DDモーター仕様表の駆動号機一覧)から号機の電圧を推測してはいけない = 捏造の元。
  //   Excelに書いていない属性は空/200V既定のまま。推測で埋めない。
  const controllers = [...byUnit.values()].map(({ _score, ...c }) => ({ ...c, voltage: c.voltage || 'AC200V' }));
  // motorSpecs は同一(type|axis|model|cap)を統合（駆動号機はマージ）
  const msMap = new Map();
  for (const ms of motorSpecs) {
    const k = [ms.productType, ms.axisKind, ms.motorModel, ms.capacity].join('|');
    if (!msMap.has(k)) msMap.set(k, { ...ms, units: [...ms.units] });
    else { const cur = msMap.get(k); for (const u of ms.units) if (!cur.units.includes(u)) cur.units.push(u); }
  }
  return { controllers, motorSpecs: [...msMap.values()] };
}

/**
 * 生産課Excel再取込と、アプリ内で編集した特別対応表のマージ。
 * ・同一行(型式|軸|モーター|容量)は Excel側の units/capacity/voltage を採用しつつ、
 *   アプリ側でしか持たない 備考(note)/フラグ上書き(dd/dAmp/batteryless)/custom はそのまま残る
 *   (incoming にそれらのキーが無い＝スプレッドで上書きされない)。
 * ・アプリで手動追加した行(custom=true)は、Excelに無くても消さない。
 * ・Excel由来の行がExcelから消えた場合は削除に従う(Excelがその行の真実の源)。
 */
// ── 特別対応表 Excel往復（純関数＝Nodeで実テスト可能） ──
export const MOTOR_SPEC_XLSX_HEADER = ['型式', '軸', 'モーター型式', '容量', '電圧', '駆動できる号機', '直駆動DD', 'D駆動((D)ｱﾝﾌﾟ)', 'バッテリーレス', '備考', '手動'];
/** 特別対応表 → Excel用二次元配列（ヘッダ+行）。ddは実効値(未定義=旧DD表由来→○)で書く=1往復で明示化される。
 *  手動=アプリで手動追加した行(生産課Excel再取込で消えない)。○を付けなければ生産課Excel由来として扱われる。 */
export function motorSpecsToAoa(specs) {
  return [MOTOR_SPEC_XLSX_HEADER, ...(specs || []).map(s => [
    s.productType || '', s.axisKind || '', s.motorModel || '', s.capacity || '',
    is400V(s.voltage) ? '400V' : '200V', (s.units || []).join(','),
    s.dd !== false ? '○' : '', s.dAmp === true ? '○' : '', s.batteryless ? '○' : '', s.note || '',
    s.custom === true ? '○' : '',
  ])];
}
/** 「18,22」「18号機、22号機」等の号機リスト文字列 → ['18','22']。 */
export function parseMotorSpecUnitsText(t) {
  return String(t || '').split(/[,、\s\/]+/).map(x => x.replace(/号機/g, '').trim()).filter(Boolean);
}
/** Excel二次元配列 → 特別対応表。ヘッダ行を自動検出。戻り値 {specs, error}。 */
export function parseMotorSpecsAoa(rows) {
  const R = (rows || []).map(r => (Array.isArray(r) ? r : []));
  const hi = R.findIndex(r => r.some(c => String(c).trim() === '型式') && r.some(c => String(c).trim() === 'モーター型式'));
  if (hi < 0) return { specs: [], error: 'ヘッダ行(型式/モーター型式)が見つかりません。「Excelダウンロード」の雛形の形で入れてください。' };
  const hdr = R[hi].map(c => String(c).trim());
  const col = (...names) => { for (const n of names) { const i = hdr.indexOf(n); if (i >= 0) return i; } return -1; };
  const iType = col('型式'), iAxis = col('軸'), iModel = col('モーター型式'), iCap = col('容量'), iVol = col('電圧'),
    iUnits = col('駆動できる号機', '駆動装置'), iDd = col('直駆動DD', '直駆動', 'DD'), iDamp = col('D駆動((D)ｱﾝﾌﾟ)', 'D駆動'),
    iBl = col('バッテリーレス', 'BL'), iNote = col('備考'), iCustom = col('手動');
  const mark = (v) => /[○◯]|^(1|true|yes)$/i.test(String(v == null ? '' : v).trim());
  const cell = (r, i) => (i >= 0 && i < r.length ? String(r[i]).trim() : '');
  let curType = ''; const specs = [];
  for (const r of R.slice(hi + 1)) {
    const t = cell(r, iType); if (t) curType = t;             // 型式セルは結合/空継続に対応(直前の型式を引き継ぐ)
    const model = cell(r, iModel); if (!model) continue;
    const row = {
      productType: normProductType(curType), axisKind: cell(r, iAxis), motorModel: model,
      capacity: normCap(cell(r, iCap)), voltage: /400/.test(cell(r, iVol)) ? 'AC400V' : 'AC200V',
      units: parseMotorSpecUnitsText(cell(r, iUnits)), note: cell(r, iNote),
      dd: iDd >= 0 ? mark(cell(r, iDd)) : true,               // DD列が無い古いファイルは旧D.D.表=直駆動扱い
    };
    if (iDamp >= 0 && mark(cell(r, iDamp))) { row.dAmp = true; row.dd = false; }  // ddとdAmpは排他(D駆動指定が優先)
    if (iBl >= 0 && mark(cell(r, iBl))) row.batteryless = true;
    // 手動フラグ: 列があれば○の行だけcustom(生産課Excel再取込で消えない)。列が無い古いファイルは呼び出し側で既存表と突合して決める。
    if (iCustom >= 0) { if (mark(cell(r, iCustom))) row.custom = true; }
    else row.customUnknown = true;
    specs.push(row);
  }
  return { specs, error: specs.length ? '' : '取り込める行がありません（モーター型式が空）。' };
}

// ── モーター一覧(自動判定+上書き) Excel往復（純関数） ──
const _mkeyCD = (s) => toHalfWidth(String(s || '')).replace(/\s+/g, '').toUpperCase();
export const MOTOR_OVERRIDE_XLSX_HEADER = ['モーター型式', '自動容量', '自動電圧', '自動タグ', '上書き容量', '上書き電圧', 'D駆動', '直駆動DD', 'バッテリーレス', '備考'];
/** モーター一覧 → Excel用二次元配列。自動判定は参照用(取込時は無視)、上書き列(容量/電圧/D/DD/BL○×/備考)が編集対象。 */
export function motorOverridesToAoa(models, overrides) {
  const ovByKey = new Map((overrides || []).map(o => [_mkeyCD(o.model), o]));
  return [MOTOR_OVERRIDE_XLSX_HEADER, ...(models || []).map(m => {
    const a = autoMotorAttrs(m); const o = ovByKey.get(_mkeyCD(m)) || {};
    const tags = [a.hv ? 'HV' : '', a.dd ? 'DD' : '', a.dAmp ? 'D' : '', a.b ? '-B' : '', a.batteryless ? 'BL' : ''].filter(Boolean).join(' ');
    const triStr = (v) => (v === true ? '○' : (v === false ? '×' : ''));
    return [m, a.capacity || '', a.voltage === '400V' ? '400V' : (a.voltage || ''), tags,
      normCap(o.capacity) || '', is400V(o.voltage) ? '400V' : (o.voltage ? '200V' : ''),
      triStr(o.dAmp), triStr(o.dd), triStr(o.batteryless), o.note || ''];
  })];
}
/** Excel二次元配列 → motorOverrides(上書きの入った行のみ)。○/×/空=3状態(空=自動判定を使う)。 */
export function parseMotorOverridesAoa(rows) {
  const R = (rows || []).map(r => (Array.isArray(r) ? r : []));
  const hi = R.findIndex(r => r.some(c => String(c).trim() === 'モーター型式'));
  if (hi < 0) return { overrides: [], error: 'ヘッダ行(モーター型式)が見つかりません。「Excelダウンロード」の雛形の形で入れてください。' };
  const hdr = R[hi].map(c => String(c).trim());
  const col = (...names) => { for (const n of names) { const i = hdr.indexOf(n); if (i >= 0) return i; } return -1; };
  const iM = col('モーター型式'), iCap = col('上書き容量'), iVol = col('上書き電圧'), iD = col('D駆動'), iDD = col('直駆動DD'), iBL = col('バッテリーレス'), iNote = col('備考');
  const cell = (r, i) => (i >= 0 && i < r.length ? String(r[i]).trim() : '');
  const tri = (v) => { const s = String(v || '').trim(); if (/[○◯]|^(1|true|yes)$/i.test(s)) return true; if (/[×xX]|^(0|false|no)$/i.test(s)) return false; return undefined; };
  const overrides = [];
  for (const r of R.slice(hi + 1)) {
    const m = cell(r, iM); if (!m) continue;
    const o = { model: m };
    const cap = normCap(cell(r, iCap)); if (cap) o.capacity = cap;
    const vol = cell(r, iVol); if (vol) o.voltage = /400/.test(vol) ? 'AC400V' : 'AC200V';
    const d = tri(cell(r, iD)); if (d != null) o.dAmp = d;
    const dd = tri(cell(r, iDD)); if (dd != null) o.dd = dd;
    const bl = tri(cell(r, iBL)); if (bl != null) o.batteryless = bl;
    const note = cell(r, iNote); if (note) o.note = note;
    if (o.capacity || o.voltage || o.dAmp != null || o.dd != null || o.batteryless != null || o.note) overrides.push(o);
  }
  return { overrides, error: overrides.length ? '' : '上書きの入った行がありません（容量/電圧/D/DD/BL/備考のいずれかに記入してください）。' };
}

export function mergeMotorSpecs(existing, incoming) {
  const key = (s) => [s.productType, s.axisKind, s.motorModel, normCap(s.capacity)].join('|');
  const exByKey = new Map((existing || []).map(s => [key(s), s]));
  const inKeys = new Set();
  const out = (incoming || []).map(r => {
    const k = key(r); inKeys.add(k);
    const ex = exByKey.get(k);
    return ex ? { ...ex, ...r } : r;
  });
  for (const ex of (existing || [])) if (ex && ex.custom === true && !inKeys.has(key(ex))) out.push(ex);
  return out;
}

/**
 * D.D.モーター仕様表の「傾斜軸(記載なし)」に回転軸の駆動可能号機(units)を継承する。
 * 現場ルール: 傾斜軸の駆動装置欄が空なのは「回転軸と同じ制御装置＝軸はある」の意味(清水指摘)。
 *   同一型式(productType)内で、units が空の非回転軸へ回転軸の units をコピーし unitsInherited:true を付ける。
 *   ⚠ 元々 units が入っている行(RTT-465の200V/400V別記載 等)は上書きしない。
 */
export function withInheritedTiltUnits(motorSpecs) {
  const specs = (motorSpecs || []).map(m => ({ ...m, units: Array.isArray(m.units) ? [...m.units] : [] }));
  const rotByType = new Map();
  for (const m of specs) {
    // 継承元も直駆動(dd)行のみ(普通モーターの回転軸unitsをDD傾斜軸へ写さない)
    if (/回転/.test(m.axisKind || '') && m.units.length && m.dd !== false && !rotByType.has(m.productType)) rotByType.set(m.productType, m.units);
  }
  for (const m of specs) {
    // 継承は直駆動(dd)行のみ。普通モーター行のunits空欄は「制限なし」の意味なので継承で縛らない。
    if (!m.units.length && !/回転/.test(m.axisKind || '') && m.dd !== false) {
      const inh = rotByType.get(m.productType);
      if (inh && inh.length) { m.units = [...inh]; m.unitsInherited = true; }
    }
  }
  return specs;
}

/**
 * 型式(lot.model) から、D.D.モーター仕様表(motorSpecs)を使って軸(モーター)候補を作る。
 * 戻り値: [{ model, capacity, voltage, dd, label(軸種), units }]（無ければ []）。回転軸→傾斜軸の順。
 */
export function suggestMotorAxes(model, motorSpecs) {
  const pt = normProductType(model);
  if (!/RT[TH]-\d+/.test(pt)) return [];
  const matches = (motorSpecs || []).filter(ms => ms.productType === pt);
  if (!matches.length) return [];
  const order = { '回転軸': 0, '傾斜軸': 1 };
  const byKind = new Map();
  for (const ms of matches) { const k = ms.axisKind || `軸${byKind.size + 1}`; if (!byKind.has(k)) byKind.set(k, ms); }
  const kinds = [...byKind.keys()].sort((a, b) => (order[a] == null ? 9 : order[a]) - (order[b] == null ? 9 : order[b]));
  return kinds.map(k => {
    const ms = byKind.get(k);
    // 表(特別対応表)の行フラグが真実。レガシー行(dd未定義)=旧D.D.表由来なので直駆動扱い(型式名にDISが無いTSUDA-02等も含む)。
    return { model: ms.motorModel, capacity: ms.capacity, voltage: ms.voltage, dd: ms.dd !== false, batteryless: !!ms.batteryless, label: k, units: ms.units };
  });
}

/** ゆるい日付("2026/6/30" "2026-6-30" "2026.6.30") → "YYYY-MM-DD"。不正なら ''。 */
export function ymdFromLoose(s) {
  const m = String(s || '').trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${m[1]}-${p(m[2])}-${p(m[3])}`;
}

/**
 * 指図モーター表(貼り付け/Excel)をパース。列= 指図 / 型式 / 台数 / 回転軸 / 傾斜軸 / 基準日(任意)。
 * タブ区切り優先、無ければ2つ以上の空白で分割。ヘッダ行(「指図」含む)は飛ばす。
 * 戻り値: [{ orderNo, model, quantity, axes:[{model,label}], dueDate? }]
 */
export function parseOrderMotorText(text) {
  const out = [];
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.includes('\t') ? line.split('\t') : line.split(/ {2,}|　+/);
    const c = cols.map(s => String(s == null ? '' : s).trim());
    const orderNo = c[0] || '';
    if (!orderNo || /指図/.test(orderNo)) continue;         // ヘッダ/空行
    if (!/^\d{3,}$/.test(orderNo)) continue;                // 指図番号は数字のみ
    const model = c[1] || '';
    const quantity = parseInt(c[2], 10) || 1;
    const rot = c[3] || '', tilt = c[4] || '';
    const axes = [];
    if (rot) axes.push({ model: rot, label: '回転軸' });
    if (tilt) axes.push({ model: tilt, label: '傾斜軸' });
    const dueDate = ymdFromLoose(c[5]);                     // 基準日
    out.push({ orderNo, model, quantity, axes, ...(dueDate ? { dueDate } : {}) });
  }
  return out;
}

/** 最小限のCSVパーサ（ダブルクオート対応・改行/カンマ）。 */
export function parseCsvRows(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = String(text || '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // 全空行は除去
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
