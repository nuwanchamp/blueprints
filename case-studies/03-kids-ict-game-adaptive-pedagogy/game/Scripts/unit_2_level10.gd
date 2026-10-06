# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — LEVEL 10 — "Word Builder"  (FINALE, prototype)
#  Skill: type a word, fix slips with Backspace, confirm with Enter
#
#  PROTOTYPE NOTE: narration uses the recorded voice clips in
#  Assets/unit2-level10/, same audio-first pattern as Levels 1–9
#  (see _say()). Zig (the keyboard-bodied mascot) stands in for
#  Pip here, same as Levels 1–9; everything else stays procedural,
#  with letter glyphs in the plain default font so they match the
#  child's physical keyboard.
#
#  MECHANIC (per Keyboard_Skills_Adventure_Level_Plan.md)
#  - A short friendly word appears with empty slots underneath.
#  - Typing fills the next empty slot with whatever letter was
#    pressed — even a wrong one. Correct letters glow green and
#    chime; wrong ones turn amber with a gentle "Backspace fixes
#    slips" nudge. That correction loop IS the lesson.
#  - BACKSPACE erases the last letter with a little poof.
#  - ENTER submits: a matching word celebrates and the next word
#    marches in; an unfinished word just gets kind coaching.
#  - 3 words, each one letter longer: ZIG -> STAR -> MOUSE.
#  - After the third word, the grand finale.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 19   # StarChart badge slot (Unit 2 starts at 11)
const NEXT_SCENE := "res://Scenes/unit2-results.tscn"   # placeholder — results screen not built yet

const IDLE_HINT_SECONDS := 8.0
const WORDS := ["ZIG", "STAR", "MOUSE"]

const COL_BG   := Color("e0f7f4")   # same fresh minty pastel as levels 1–9
const GOLD := Color("ffd166")
const GREEN := Color("06d6a0")
const AMBER := Color("ffb84d")
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-trans.png")
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

const SLOT_SIZE := Vector2(92, 92)
const SLOT_GAP := 18.0

# --- Recorded narration clips ---
const VOICE_INTRO: AudioStream = preload("res://Assets/unit2-level10/build-a-word.mp3")
const VOICE_CAN_YOU_TYPE: AudioStream = preload("res://Assets/unit2-level10/can-you-type.mp3")
const VOICE_NOT_DONE_YET: AudioStream = preload("res://Assets/unit2-level10/not-done-yet.mp3")
const VOICE_CHECK_YOUR_WORD: AudioStream = preload("res://Assets/unit2-level10/check-your-word.mp3")
const VOICE_WORD_IS_FULL: AudioStream = preload("res://Assets/unit2-level10/word-is-full.mp3")
const VOICE_NOT_QUITE_IT: AudioStream = preload("res://Assets/unit2-level10/not-quite-it.mp3")
const VOICE_YOU_TYPED: AudioStream = preload("res://Assets/unit2-level10/you-typed.mp3")
const VOICE_YOU_TYPED_WHOLE: AudioStream = preload("res://Assets/unit2-level10/you-typed-whole.mp3")
const VOICE_WORD_READY: AudioStream = preload("res://Assets/unit2-level10/your-word-is-ready.mp3")
const VOICE_NEXT_LETTER: AudioStream = preload("res://Assets/unit2-level10/next-letter-is.mp3")
const VOICE_PRESS_BACKSPACE: AudioStream = preload("res://Assets/unit2-level10/press-backspace.mp3")

var _word_idx := 0
var _typed := ""
var _accepting := false
var _finished := false

var _slot_layer: CanvasLayer
var _slots: Array[Dictionary] = []   # {panel, box, label}
var _word_label: RichTextLabel
var _zig: Sprite2D
var _idle_timer: Timer
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _current_instruction := "Type each letter! Backspace fixes slips, Enter says DONE!"
var _current_clip: AudioStream = VOICE_CAN_YOU_TYPE


func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR)
	randomize()

	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_slot_layer = CanvasLayer.new()
	_slot_layer.layer = 5
	add_child(_slot_layer)

	_build_zig()
	_build_word_label()
	_build_ui()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_INTRO, "Let's build a word together! Type each letter — Backspace fixes slips, and Enter says DONE!")
	_start_word(0)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Zig cheers from the side.
# ----------------------------------------------------------------
func _build_zig() -> void:
	_zig = Sprite2D.new()
	_zig.texture = ZIG_TEXTURE
	_zig.scale = Vector2.ONE * (330.0 / ZIG_TEXTURE.get_width())
	_zig.position = Vector2(_screen_size().x * 0.16, _screen_size().y * 0.45)
	add_child(_zig)


func _zig_clap() -> void:
	var base_scale := _zig.scale
	var t := create_tween()
	for i in 3:
		t.tween_property(_zig, "scale", base_scale * 1.12, 0.12)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		t.tween_property(_zig, "scale", base_scale, 0.12)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)


# ----------------------------------------------------------------
#  The target word (big, readable) above the letter slots.
# ----------------------------------------------------------------
func _build_word_label() -> void:
	_word_label = RichTextLabel.new()
	_word_label.bbcode_enabled = false
	_word_label.fit_content = true
	_word_label.scroll_active = false
	_word_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Plain default font on purpose — the child copies these glyphs.
	_word_label.add_theme_font_size_override("normal_font_size", 88)
	_word_label.add_theme_color_override("default_color", Color("2c6e68"))
	_word_label.anchor_left = 0.05
	_word_label.anchor_right = 0.95
	_word_label.anchor_top = 0.2
	_word_label.anchor_bottom = 0.38
	_slot_layer.add_child(_word_label)


func _center_word(word: String) -> void:
	# RichTextLabel centering without bbcode: pad via alignment container
	# is overkill — just use spaces? No: set text and rely on fit_content
	# with manual horizontal centering below.
	_word_label.text = word
	# Rough visual centering: each glyph at 88px is ~55px wide.
	var est_w := word.length() * 55.0
	_word_label.anchor_left = 0.0
	_word_label.anchor_right = 0.0
	_word_label.offset_left = _screen_size().x * 0.5 - est_w * 0.5
	_word_label.offset_right = _screen_size().x * 0.5 + est_w * 0.5 + 40.0


# ----------------------------------------------------------------
#  Word / slot flow
# ----------------------------------------------------------------
func _current_word() -> String:
	return WORDS[_word_idx]


func _start_word(idx: int) -> void:
	_word_idx = idx
	_typed = ""
	_accepting = true

	for entry in _slots:
		(entry["panel"] as Panel).queue_free()
	_slots.clear()

	var word := _current_word()
	_center_word(word)

	var count := word.length()
	var total_w := count * SLOT_SIZE.x + (count - 1) * SLOT_GAP
	var left := _screen_size().x * 0.5 - total_w * 0.5
	var y := _screen_size().y * 0.5

	for i in count:
		var entry := _make_slot()
		var panel: Panel = entry["panel"]
		panel.position = Vector2(left + i * (SLOT_SIZE.x + SLOT_GAP), y)
		panel.size = SLOT_SIZE
		_slot_layer.add_child(panel)
		_slots.append(entry)

	_say(VOICE_CAN_YOU_TYPE, "Can you type the word %s? One letter at a time!" % word)
	_idle_timer.start()


func _make_slot() -> Dictionary:
	var slot := Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color(1, 1, 1, 0.6)
	box.border_width_left = 4
	box.border_width_top = 4
	box.border_width_right = 4
	box.border_width_bottom = 4
	box.border_color = Color("9dc4bf")   # empty slots look "waiting"
	box.corner_radius_top_left = 14
	box.corner_radius_top_right = 14
	box.corner_radius_bottom_right = 14
	box.corner_radius_bottom_left = 14
	box.shadow_color = Color(0.158, 0.158, 0.158, 0.3)
	box.shadow_size = 2
	box.shadow_offset = Vector2(2, 3)
	slot.add_theme_stylebox_override("panel", box)

	var label := Label.new()
	# Plain default font on purpose — must match physical key glyphs.
	label.add_theme_font_size_override("font_size", 52)
	label.add_theme_color_override("font_color", Color("2c6e68"))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.anchor_right = 1.0
	label.anchor_bottom = 1.0
	slot.add_child(label)

	return {"panel": slot, "box": box, "label": label}


func _refresh_slot(i: int) -> void:
	var entry := _slots[i]
	var box: StyleBoxFlat = entry["box"]
	var label: Label = entry["label"]
	if i < _typed.length():
		var ch := _typed[i]
		label.text = ch
		var correct := ch == _current_word()[i]
		box.bg_color = Color(1, 1, 1, 1)
		box.border_color = GREEN if correct else AMBER
	else:
		label.text = ""
		box.bg_color = Color(1, 1, 1, 0.6)
		box.border_color = Color("9dc4bf")


func _pop_slot(i: int) -> void:
	var panel: Panel = _slots[i]["panel"]
	panel.pivot_offset = SLOT_SIZE * 0.5
	var t := create_tween()
	t.tween_property(panel, "scale", Vector2.ONE * 1.18, 0.12)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(panel, "scale", Vector2.ONE, 0.18)


func _poof_slot(i: int) -> void:
	# The Backspace "poof": a little white puff where the letter was.
	var panel: Panel = _slots[i]["panel"]
	var center := panel.position + SLOT_SIZE * 0.5
	for k in 5:
		var puff := Polygon2D.new()
		var pts := PackedVector2Array()
		for p in 8:
			var ang := TAU * p / 8.0
			pts.append(Vector2(cos(ang), sin(ang)) * randf_range(6.0, 11.0))
		puff.polygon = pts
		puff.color = Color(1, 1, 1, 0.9)
		puff.position = center
		puff.z_index = 50
		add_child(puff)
		var dir := Vector2.from_angle(randf_range(0.0, TAU))
		var t := create_tween()
		t.tween_property(puff, "position", center + dir * randf_range(30.0, 60.0), 0.35)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		t.parallel().tween_property(puff, "modulate:a", 0.0, 0.35)
		t.tween_callback(puff.queue_free)


# ----------------------------------------------------------------
#  Input
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if _finished or not _accepting or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	_idle_timer.start()

	var word := _current_word()

	if key.keycode == KEY_BACKSPACE:
		if _typed.length() > 0:
			var i := _typed.length() - 1
			_typed = _typed.substr(0, i)
			_poof_slot(i)
			_refresh_slot(i)
			_play_tone(500.0, 300.0, 0.1, 0.2)   # soft "whip away"
		return

	if key.keycode == KEY_ENTER or key.keycode == KEY_KP_ENTER:
		if _typed == word:
			_on_word_complete()
		elif _typed.length() < word.length():
			_say(VOICE_NOT_DONE_YET, "Not done yet! The word needs %d more letters." % (word.length() - _typed.length()))
		else:
			_say(VOICE_CHECK_YOUR_WORD, "Check your word! Backspace fixes slips.")
		return

	var pressed := OS.get_keycode_string(key.keycode).to_upper()
	if pressed.length() == 1 and pressed >= "A" and pressed <= "Z":
		if _typed.length() >= word.length():
			_say(VOICE_WORD_IS_FULL, "The word is full! Press Enter, or Backspace to fix.")
			return
		var i := _typed.length()
		_typed += pressed
		_refresh_slot(i)
		_pop_slot(i)
		if pressed == word[i]:
			_play_chime()
		else:
			_play_tone(400.0, 350.0, 0.12, 0.2)   # gentle, not scary
			_say(VOICE_NOT_QUITE_IT, "Hmm, that's not quite it — Backspace fixes slips!")
	# Non-letter keys are silently ignored.


# ----------------------------------------------------------------
#  Word complete / finale
# ----------------------------------------------------------------
func _on_word_complete() -> void:
	_accepting = false
	_idle_timer.stop()
	_zig_clap()
	Confetti.rain(40, 0.8)
	_play_chime()
	for i in _slots.size():
		_pop_slot(i)

	if _word_idx < WORDS.size() - 1:
		_say(VOICE_YOU_TYPED, "You typed %s! Wonderful! Here comes a longer one!" % _current_word())
		get_tree().create_timer(2.0).timeout.connect(
			func () -> void:
				if not _finished:
					_start_word(_word_idx + 1)
		)
	else:
		_on_level_finished()


func _on_level_finished() -> void:
	_finished = true
	_idle_timer.stop()
	Confetti.rain(120, 2.0)
	_zig_clap()
	StarChart.show_chart(StarChart.UNIT_2_LEVELS)
	StarChart.add_star(LEVEL_NUMBER)
	_say(VOICE_YOU_TYPED_WHOLE, "You typed a whole word all by yourself! You finished the keyboard adventure!")
	get_tree().create_timer(3.0).timeout.connect(_on_celebration_finished)


func _on_celebration_finished() -> void:
	level_completed.emit(LEVEL_NUMBER)
	var err := get_tree().change_scene_to_file(NEXT_SCENE)
	if err != OK:
		# The Unit 2 results screen doesn't exist yet — stay put instead
		# of crashing, and start the word game over.
		_finished = false
		_start_word(0)


# ----------------------------------------------------------------
#  Idle hint: name the next letter needed.
# ----------------------------------------------------------------
func _on_idle_hint() -> void:
	if _finished or not _accepting:
		return
	var word := _current_word()
	if _typed == word:
		_say(VOICE_WORD_READY, "Your word is ready — press ENTER!")
	elif _typed.length() < word.length() and _typed == word.substr(0, _typed.length()):
		var next_letter := word[_typed.length()]
		_say(VOICE_NEXT_LETTER, "The next letter is %s!" % next_letter)
		if _typed.length() < _slots.size():
			_pop_slot(_typed.length())
	else:
		_say(VOICE_PRESS_BACKSPACE, "Press Backspace to fix your word!")
	_idle_timer.start()


# ----------------------------------------------------------------
#  UI: one short text line + speaker button (same pattern as 1–9)
# ----------------------------------------------------------------
func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	_instruction_label = RichTextLabel.new()
	_instruction_label.bbcode_enabled = true
	_instruction_label.fit_content = true
	_instruction_label.scroll_active = false
	_instruction_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_instruction_label.add_theme_font_override("normal_font", UI_FONT)
	_instruction_label.add_theme_font_size_override("normal_font_size", 34)
	_instruction_label.add_theme_color_override("font_outline_color", Color("1d4a46"))
	_instruction_label.add_theme_constant_override("outline_size", 10)
	_instruction_label.anchor_left = 0.05
	_instruction_label.anchor_right = 0.95
	_instruction_label.anchor_top = 0.1
	_instruction_label.anchor_bottom = 0.2
	layer.add_child(_instruction_label)

	_speaker_btn = Button.new()
	_speaker_btn.text = "🔊"
	_speaker_btn.add_theme_font_size_override("font_size", 30)
	_speaker_btn.anchor_left = 0.0
	_speaker_btn.anchor_top = 1.0
	_speaker_btn.offset_left = 16
	_speaker_btn.offset_top = -76
	_speaker_btn.offset_right = 76
	_speaker_btn.offset_bottom = -16
	_speaker_btn.pressed.connect(func () -> void: _say(_current_clip, _current_instruction))
	layer.add_child(_speaker_btn)


# ----------------------------------------------------------------
#  Narration: recorded voice clips (audio-first), text line synced
# ----------------------------------------------------------------
func _say(clip: AudioStream, text: String) -> void:
	_current_instruction = text
	_current_clip = clip
	_instruction_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ text
		+ "[/rainbow][/center]"
	)
	_voice.stop()               # never overlap two voice lines
	_voice.stream = clip
	_voice.play()


# ----------------------------------------------------------------
#  Sounds (generated, zero assets)
# ----------------------------------------------------------------
func _play_chime() -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _chime_wave()
	player.finished.connect(player.queue_free)
	player.play()


# Builds the "ta-da" chime as a real WAV buffer up front instead of
# feeding an AudioStreamGenerator live from the main thread — the
# live-push API contends with the audio mixer thread, and doing that
# for several chimes/voice lines at once (e.g. right after finishing
# a level, when this and StarChart's own chime can overlap) was able
# to hang the whole process.
func _chime_wave() -> AudioStreamWAV:
	var mix_rate := 22050
	var notes: Array[float] = [1046.5, 1568.0]   # C6 then G6
	var note_len := 0.25
	var frames_per_note := int(mix_rate * note_len)
	var data := PackedByteArray()
	data.resize(frames_per_note * notes.size() * 2)   # 16-bit mono
	var byte_idx := 0
	for freq in notes:
		for i in frames_per_note:
			var tt := float(i) / mix_rate
			var env := 1.0 - tt / note_len
			var v := sin(TAU * freq * tt) * 0.22 * env
			data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
			byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav


func _play_tone(freq_start: float, freq_end: float, dur: float, vol: float) -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _tone_wave(freq_start, freq_end, dur, vol)
	player.finished.connect(player.queue_free)
	player.play()


func _tone_wave(freq_start: float, freq_end: float, dur: float, vol: float) -> AudioStreamWAV:
	var mix_rate := 22050
	var frames := int(mix_rate * dur)
	var data := PackedByteArray()
	data.resize(frames * 2)   # 16-bit mono
	var byte_idx := 0
	for i in frames:
		var tt := float(i) / mix_rate
		var k := tt / dur
		var freq := lerpf(freq_start, freq_end, k)
		var env := 1.0 - k
		var v := sin(TAU * freq * tt) * vol * env
		data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
		byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav
