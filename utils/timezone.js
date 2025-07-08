/**
 * Timezone utility functions for consistent Korea timezone handling
 */

const KOREA_TIMEZONE = 'Asia/Seoul';
const KOREA_OFFSET_HOURS = 9;

/**
 * Convert datetime-local input to UTC ISO string for storage
 * @param {string} datetimeLocalValue - Value from datetime-local input
 * @returns {string} UTC ISO string
 */
function datetimeLocalToUTC(datetimeLocalValue) {
    if (!datetimeLocalValue) return null;
    
    // datetime-local은 사용자가 입력한 로컬 시간을 의미
    // 한국 시간으로 해석하여 UTC로 변환
    const localDate = new Date(datetimeLocalValue);
    
    // 한국 시간대 오프셋 (+9시간)을 적용하여 UTC로 변환
    const koreaOffset = KOREA_OFFSET_HOURS * 60; // 분 단위
    const utcTime = localDate.getTime() - (koreaOffset * 60 * 1000);
    
    return new Date(utcTime).toISOString();
}

/**
 * Convert UTC ISO string to datetime-local format for display
 * @param {string} utcIsoString - UTC ISO string from database
 * @returns {string} datetime-local format (YYYY-MM-DDTHH:MM)
 */
function utcToDatetimeLocal(utcIsoString) {
    if (!utcIsoString) return '';
    
    const utcDate = new Date(utcIsoString);
    
    // UTC 시간을 한국 시간으로 변환 (+9시간)
    const koreaOffset = KOREA_OFFSET_HOURS * 60; // 분 단위
    const koreaTime = new Date(utcDate.getTime() + (koreaOffset * 60 * 1000));
    
    // datetime-local 형식으로 변환 (YYYY-MM-DDTHH:MM)
    const year = koreaTime.getFullYear();
    const month = String(koreaTime.getMonth() + 1).padStart(2, '0');
    const day = String(koreaTime.getDate()).padStart(2, '0');
    const hours = String(koreaTime.getHours()).padStart(2, '0');
    const minutes = String(koreaTime.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format date for display in Korea timezone
 * @param {string|Date} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
function formatKoreaDate(date, options = {}) {
    if (!date) return '';
    
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return '';
    
    const defaultOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: KOREA_TIMEZONE
    };
    
    return dateObj.toLocaleDateString('ko-KR', { ...defaultOptions, ...options });
}

/**
 * Get current time in Korea timezone
 * @returns {Date} Current time adjusted for Korea timezone
 */
function getCurrentKoreaTime() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: KOREA_TIMEZONE }));
}

/**
 * Check if a date is in the past (Korea timezone)
 * @param {string|Date} date - Date to check
 * @returns {boolean} True if date is in the past
 */
function isDatePast(date) {
    if (!date) return false;
    
    const dateObj = new Date(date);
    const now = getCurrentKoreaTime();
    
    return dateObj < now;
}

module.exports = {
    KOREA_TIMEZONE,
    KOREA_OFFSET_HOURS,
    datetimeLocalToUTC,
    utcToDatetimeLocal,
    formatKoreaDate,
    getCurrentKoreaTime,
    isDatePast
};