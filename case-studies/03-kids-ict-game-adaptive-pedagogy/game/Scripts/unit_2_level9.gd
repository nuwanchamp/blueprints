# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — LEVEL 9 — "Big Letters"  (prototype)
#  Skill: hold Shift + press a letter — a two-input combo
#
#  PROTOTYPE NOTE: narration uses the recorded voice clips in
#  Assets/unit2-level9/, same audio-first pattern as Levels 1–8
#  (see _say()). Zig (the keyboard-bodied mascot) stands in for
#  Pip here, same as Levels 1–8; everything else stays procedural,
#  with letter glyphs in the plain default font so they match the
#  child's physical keyboard.
#
#  MECHANIC (per Keyboard_Skills_Adventure_Level_Plan.md)
#  - A small (lowercase) letter sits on a card with a
#    "Make it BIG!" prompt.
#  - Holding SHIFT and pressing that letter bursts the capital
#    onto the card with sparkles and confetti.
#  - The letter alone is never a fail: the small letter just
#    pops back with a gentle "Hold Shift first, then the letter."
#  - The on-screen SHIFT key lights up live while the real one
#    is held, so the child can SEE the hold happening.
#  - After 6 capitals the level ends.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 18   # StarChart badge slot (Unit 2 starts at 11)
const NEXT_SCENE := "res://Scenes/unit2-level10.tscn"

const CAPITALS_TO_WIN := 6
const IDLE_HINT_SECONDS := 8.0

const LETTER_POOL := ["A", "B", "D", "E", "R", "T", "M", "S"]

const COL_BG   := Color("e0f7f4")   # same fresh minty pastel as levels 1–8
const GOLD := Color("ffd166")
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-trans.png")
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# --- Recorded narration clips ---
const VOICE_INTRO: AudioStream = preload("res://Assets/unit2-level9/hold-special-key.mp3")
const VOICE_SUCCESS: AudioStream = preload("res://Assets/unit2-level9/its-a-big-letter.mp3")
const VOICE_SO_CLOSE: AudioStream = preload("res://Assets/unit2-level9/so-close.mp3")
const VOICE_ALMOST: AudioStream = preload("res://Assets/unit2-level9/this-one-is the-letter.mp3")
const VOICE_IDLE_HINT: AudioStream = preload("res://Assets/unit2-level9/hold-shift.mp3")
const VOICE_FINISH: AudioStream = preload("res://Assets/unit2-level9/six-big-letter.mp3")
const VOICE_REPLAY: AudioStream = preload("res://Assets/unit2-level9/make-it-big.mp3")

var _capitals := 0
var _target := ""               # stored uppercase; card shows lowercase
var _busy := false
var _finished := false

var _card: Panel
var _card_label: Label
var _shift_key: Panel
var _shift_box: StyleBoxFlat
var _letter_key: Panel
var _letter_box: StyleBoxFlat
var _letter_key_label: Label
var _idle_timer: Timer
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _current_instruction := "Hold SHIFT and press the letter to make it BIG!"
var _current_clip: AudioStream = VOICE_IDLE_HINT


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

	_build_zig()
	_build_card()
	_build_combo_keys()
	_build_ui()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_INTRO, "Hold this special key — SHIFT — and then press a letter to make it BIG!")
	_next_letter()


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Zig
# ----------------------------------------------------------------
func _build_zig() -> void:
	var zig := Sprite2D.new()
	zig.texture = ZIG_TEXTURE
	zig.scale = Vector2.ONE * (300.0 / ZIG_TEXTURE.get_width())
	zig.position = Vector2(_screen_size().x * 0.24, _screen_size().y * 0.42)
	add_child(zig)


# ----------------------------------------------------------------
#  The letter card: small lowercase in, BIG capital out.
# ----------------------------------------------------------------
func _build_card() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)

	var card_size := Vector2(230, 230)
	_card = Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color(1, 1, 1, 1)
	box.border_width_left = 5
	box.border_width_top = 5
	box.border_width_right = 5
	box.border_width_bottom = 5
	box.border_color = Color("2c6e68")
	box.corner_radius_top_left = 22
	box.corner_radius_top_right = 22
	box.corner_radius_bottom_right = 22
	box.corner_radius_bottom_left = 22
	box.shadow_color = Color(0.158, 0.158, 0.158, 0.5)
	box.shadow_size = 4
	box.shadow_offset = Vector2(4, 5)
	_card.add_theme_stylebox_override("panel", box)
	_card.position = Vector2(_screen_size().x * 0.56 - card_size.x * 0.5,
		_screen_size().y * 0.42 - card_size.y * 0.5)
	_card.size = card_size
	layer.add_child(_card)

	# "Make it BIG!" prompt floating above the card.
	var prompt := Label.new()
	prompt.text = "Make it BIG!"
	prompt.add_theme_font_override("font", UI_FONT)
	prompt.add_theme_font_size_override("font_size", 30)
	prompt.add_theme_color_override("font_color", Color("2c6e68"))
	prompt.position = Vector2(card_size.x * 0.5 - 92, -52)
	_card.add_child(prompt)

	_card_label = Label.new()
	# Plain default font on purpose — must match physical key glyphs.
	_card_label.add_theme_font_size_override("font_size", 72)
	_card_label.add_theme_color_override("font_color", Color("2c6e68"))
	_card_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_card_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_card_label.anchor_right = 1.0
	_card_label.anchor_bottom = 1.0
	_card.add_child(_card_label)


# ----------------------------------------------------------------
#  On-screen SHIFT + letter keys (bottom centre). SHIFT lights up
#  live while the real key is held — the child SEES the hold.
# ----------------------------------------------------------------
func _build_combo_keys() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)

	var shift_size := Vector2(190, 58)
	var letter_size := Vector2(58, 58)
	var gap := 22.0
	var total_w := shift_size.x + gap + letter_size.x
	var left := _screen_size().x * 0.5 - total_w * 0.5
	var y := _screen_size().y - 110.0

	_shift_key = Panel.new()
	_shift_box = _combo_key_box()
	_shift_key.add_theme_stylebox_override("panel", _shift_box)
	_shift_key.position = Vector2(left, y)
	_shift_key.size = shift_size
	layer.add_child(_shift_key)

	var shift_label := Label.new()
	shift_label.text = "⇧ SHIFT"
	shift_label.add_theme_font_size_override("font_size", 24)
	shift_label.add_theme_color_override("font_color", Color("2c6e68"))
	shift_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	shift_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	shift_label.anchor_right = 1.0
	shift_label.anchor_bottom = 1.0
	_shift_key.add_child(shift_label)

	# "+" between the two keys.
	var plus := Label.new()
	plus.text = "+"
	plus.add_theme_font_override("font", UI_FONT)
	plus.add_theme_font_size_override("font_size", 34)
	plus.add_theme_color_override("font_color", Color("2c6e68"))
	plus.position = Vector2(left + shift_size.x + 2.0, y + 8.0)
	layer.add_child(plus)

	_letter_key = Panel.new()
	_letter_box = _combo_key_box()
	_letter_key.add_theme_stylebox_override("panel", _letter_box)
	_letter_key.position = Vector2(left + shift_size.x + gap, y)
	_letter_key.size = letter_size
	layer.add_child(_letter_key)

	_letter_key_label = Label.new()
	_letter_key_label.add_theme_font_size_override("font_size", 28)
	_letter_key_label.add_theme_color_override("font_color", Color("2c6e68"))
	_letter_key_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_letter_key_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_letter_key_label.anchor_right = 1.0
	_letter_key_label.anchor_bottom = 1.0
	_letter_key.add_child(_letter_key_label)


func _combo_key_box() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(1, 1, 1, 1)
	box.border_width_left = 4
	box.border_width_top = 4
	box.border_width_right = 4
	box.border_width_bottom = 4
	box.border_color = Color("e8a020")
	box.corner_radius_top_left = 10
	box.corner_radius_top_right = 10
	box.corner_radius_bottom_right = 10
	box.corner_radius_bottom_left = 10
	box.shadow_color = Color(0.158, 0.158, 0.158, 0.4)
	box.shadow_size = 2
	box.shadow_offset = Vector2(2, 3)
	return box


func _process(_delta: float) -> void:
	if _finished:
		return
	# Live feedback: on-screen SHIFT glows gold the whole time the
	# real Shift key is held down.
	_shift_box.bg_color = GOLD if Input.is_key_pressed(KEY_SHIFT) else Color(1, 1, 1, 1)


# ----------------------------------------------------------------
#  Letter flow
# ----------------------------------------------------------------
func _next_letter() -> void:
	if _capitals >= CAPITALS_TO_WIN:
		_on_level_finished()
		return
	var letter: String = LETTER_POOL[randi() % LETTER_POOL.size()]
	while letter == _target:
		letter = LETTER_POOL[randi() % LETTER_POOL.size()]
	_target = letter
	_letter_key_label.text = letter
	_busy = false
	_show_small_letter()
	_idle_timer.start()


func _show_small_letter() -> void:
	_card_label.text = _target.to_lower()
	_card_label.add_theme_font_size_override("font_size", 72)
	_card_label.add_theme_color_override("font_color", Color("2c6e68"))
	_card_label.pivot_offset = _card_label.size / 2
	_card_label.scale = Vector2.ZERO
	var t := create_tween()
	t.tween_property(_card_label, "scale", Vector2.ONE, 0.3)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _burst_capital() -> void:
	_busy = true
	_idle_timer.stop()
	_capitals += 1
	_play_chime()
	Confetti.rain(30, 0.5)
	_spawn_sparkles()

	_card_label.text = _target
	_card_label.add_theme_font_size_override("font_size", 150)
	_card_label.add_theme_color_override("font_color", Color("e8720c"))
	_card_label.pivot_offset = _card_label.size / 2
	_card_label.scale = Vector2.ZERO

	_card.pivot_offset = _card.size * 0.5
	var ct := create_tween()
	ct.tween_property(_card, "scale", Vector2.ONE * 1.12, 0.2)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	ct.tween_property(_card, "scale", Vector2.ONE, 0.2)

	var t := create_tween()
	t.tween_property(_card_label, "scale", Vector2.ONE * 1.25, 0.4)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(_card_label, "scale", Vector2.ONE, 0.15)
	t.tween_interval(1.0)
	t.tween_callback(_next_letter)

	_say(VOICE_SUCCESS, "It's a BIG %s! Wonderful!" % _target)


func _spawn_sparkles() -> void:
	# A ring of little white sparkle stars around the card.
	var center := _card.position + _card.size * 0.5
	for i in 8:
		var star := Polygon2D.new()
		var pts := PackedVector2Array()
		for k in 8:
			var r := 10.0 if k % 2 == 0 else 4.0
			var ang := TAU * k / 8.0
			pts.append(Vector2(cos(ang), sin(ang)) * r)
		star.polygon = pts
		star.color = Color(1, 1, 1, 0.95)
		star.position = center
		star.z_index = 50
		add_child(star)

		var dir := Vector2.from_angle(TAU * i / 8.0)
		var t := create_tween()
		t.tween_property(star, "position", center + dir * 170.0, 0.55)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		t.parallel().tween_property(star, "modulate:a", 0.0, 0.55)
		t.tween_callback(star.queue_free)


# ----------------------------------------------------------------
#  Input
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if _finished or _busy or _target == "" or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	if key.keycode == KEY_SHIFT:
		return   # holding Shift is half the combo, not a mistake
	_idle_timer.start()

	var pressed := OS.get_keycode_string(key.keycode).to_upper()
	if pressed == _target and key.shift_pressed:
		_burst_capital()
	elif pressed == _target:
		# The right letter without Shift — SO close. Gentle re-show.
		_flash_key(_shift_key)
		_say(VOICE_SO_CLOSE, "So close! Hold SHIFT first, then press %s." % _target)
		_show_small_letter()
	elif pressed.length() == 1 and pressed >= "A" and pressed <= "Z":
		_flash_key(_letter_key)
		_say(VOICE_ALMOST, "Almost — this one is the letter %s!" % _target)
	# Non-letter keys are silently ignored.


func _flash_key(panel: Panel) -> void:
	panel.pivot_offset = panel.size * 0.5
	var t := create_tween()
	t.tween_property(panel, "scale", Vector2.ONE * 1.15, 0.1)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(panel, "scale", Vector2.ONE, 0.2)


# ----------------------------------------------------------------
#  Idle hint: pulse SHIFT then the letter key, in combo order.
# ----------------------------------------------------------------
func _on_idle_hint() -> void:
	if _finished or _busy:
		return
	_say(VOICE_IDLE_HINT, "Hold SHIFT and press %s to make it BIG!" % _target)
	var t := create_tween()
	t.tween_method(func (c: Color) -> void: _shift_box.bg_color = c,
		Color(1, 1, 1), GOLD, 0.3).set_trans(Tween.TRANS_SINE)
	t.tween_method(func (c: Color) -> void: _letter_box.bg_color = c,
		Color(1, 1, 1), GOLD, 0.3).set_trans(Tween.TRANS_SINE)
	t.tween_method(func (c: Color) -> void: _letter_box.bg_color = c,
		GOLD, Color(1, 1, 1), 0.3).set_trans(Tween.TRANS_SINE)
	_idle_timer.start()


# ----------------------------------------------------------------
#  Finish
# ----------------------------------------------------------------
func _on_level_finished() -> void:
	_finished = true
	_idle_timer.stop()
	Confetti.rain()
	StarChart.show_chart(StarChart.UNIT_2_LEVELS)
	StarChart.add_star(LEVEL_NUMBER)
	_say(VOICE_FINISH, "Six BIG letters! You're a capital champion!")
	get_tree().create_timer(2.5).timeout.connect(_on_celebration_finished)


func _on_celebration_finished() -> void:
	level_completed.emit(LEVEL_NUMBER)
	var err := get_tree().change_scene_to_file(NEXT_SCENE)
	if err != OK:
		# Level 10 not present — stay put instead of crashing.
		_finished = false
		_capitals = 0
		_say(VOICE_REPLAY, "Hold SHIFT and press a letter to make it BIG!")
		_next_letter()


# ----------------------------------------------------------------
#  UI: one short text line + speaker button (same pattern as 1–8)
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
#  Chime (generated, zero assets)
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
