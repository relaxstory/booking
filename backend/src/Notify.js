/**
 * 通知信（階段 4 實作）。
 *
 * notify_(event, { session, script, participants, participant?, previous? })
 *   participants：該場「已加入」的參與者；participant：單一對象（申請者、被核准者等）
 *
 * 前台事件：
 *   booking_submitted     包場／拼團登記送出（已預約時寄確認信；待確認不寄）
 *   join_applied          送出加入拼場申請 → participant
 * 後台事件：
 *   booking_confirmed     包場確認，或後台直接建立包場 → 登記者
 *   group_opened          拼團待確認被確認，或後台直接建立拼場 → 主揪
 *   booking_rejected      拒絕 → 登記者
 *   session_changed       修改時間或劇本（previous 為原本的時間）→ 該場所有人
 *   booking_cancelled     取消 → 該場所有人
 *   group_failed          拼團失敗取消 → 該場所有人
 *   group_formed          成團（轉為已預約）→ 該場所有人
 *   application_approved  加入申請核准 → participant
 *   application_rejected  加入申請拒絕 → participant
 *   participant_added     管理者直接加入拼場 → participant
 */
function notify_(event, data) {
  // 階段 4：依 spec 第 7 節寄送 Email
}
