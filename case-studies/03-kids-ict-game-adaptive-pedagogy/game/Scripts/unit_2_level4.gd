# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — LEVEL 4 — "Find the Letter"  (prototype)
#  Skill: locating a specific named key
#
#  PROTOTYPE NOTE: narration uses the recorded voice clips in
#  Assets/unit2-level4/, same audio-first pattern as Levels 1–3
#  (see _say()). The one dynamic line ("Yes! You found the letter
#  X!") has no matching recording — since the letter name can't be
#  pre-recorded for every round, it stays text-only, backed by the
#  success chime instead. Zig (the keyboard-bodied mascot) stands
#  in for Pip, purely as company — the on-screen keyboard itself
#  stays procedurally drawn with real QWERTY letter labels, since
#  Zig's decorative art has no actual letters baked into its keys
#  and this level's mechanic depends on getting the right letter
#  on the right key.
#
#  MECHANIC (per Keyboard_Skills_Adventure_Level_Plan.md)
#  - One big letter shows next to Zig. Press that key to win it.
#  - 3 rounds of 4 letters: round 1 big/distinct (A O M T),
#    round 2 middling (S P W K), round 3 look-alike neighbours
#    (E R I O) — the hidden precision ramp.
#  - Wrong keys: a gentle "Almost — keep looking!", never a fail.
#  - Idle hint (8s): the target key glows on the on-screen
#    keyboard — the ghost-cursor equivalent for keyboards.
#  - After all 12 letters, the level ends with confetti.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 13   # StarChart badge slot (Unit 2 starts at 11)
const NEXT_SCENE := "res://Scenes/unit2-level5.tscn"   # placeholder — level 5 not built yet

const IDLE_HINT_SECONDS := 8.0

# One pool per round; order within a round is shuffled each play.
const ROUND_POOLS := [
	["A", "O", "M", "T"],
	["S", "P", "W", "K"],
	["E", "R", "I", "O"],
]

const COL_BG   := Color("e0f7f4")   # same fresh minty pastel as levels 1–3
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-trans.png")
const ZIG_WIDTH := 300.0   # smaller than Pip's old footprint, to clear the title/star chart above
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# --- Recorded narration clips ---
const VOICE_CAN_YOU_FIND: AudioStream = preload("res://Assets/unit2-level4/can-you-find.mp3")
const VOICE_PRESS_WHEN_YOU_SEE: AudioStream = preload("res://Assets/unit2-level4/press-when-you-see.mp3")
const VOICE_MORE_LETTERS: AudioStream = preload("res://Assets/unit2-level4/more-letters.mp3")
const VOICE_ALMOST_KEEP_LOOKING: AudioStream = preload("res://Assets/unit2-level4/almost-keep-looking.mp3")
const VOICE_AMAZING_FOUND_ALL: AudioStream = preload("res://Assets/unit2-level4/amazing-you-found-it-all.mp3")

const KEY_LAYOUT := ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"]
const KEY_SIZE := Vector2(58, 58)
const KEY_GAP := 10.0

var _round := 0
var _letters: Array = []        # shuffled letters for the current round
var _letter_idx := 0
var _target := ""
var _finished := false

var _keys: Dictionary = {}      # letter -> {panel: Panel, box: StyleBoxFlat}
var _target_label: Label
var _hint_tween: Tween
var _idle_timer: Timer
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _current_instruction := "Press it when you see it!"
var _current_clip: AudioStream = VOICE_PRESS_WHEN_YOU_SEE


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
	_build_target_card()
	_build_keyboard()
	_build_ui()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_CAN_YOU_FIND, "Can you find this letter on your keyboard?")
	_start_round(0)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Zig + the big target-letter card beside him
# ----------------------------------------------------------------
func _build_zig() -> void:
	var zig := Sprite2D.new()
	zig.texture = ZIG_TEXTURE
	zig.scale = Vector2.ONE * (ZIG_WIDTH / ZIG_TEXTURE.get_width())
	zig.position = Vector2(_screen_size().x * 0.36, _screen_size().y * 0.40)
	add_child(zig)


func _build_target_card() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)

	var card := Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color(1, 1, 1, 1)
	box.border_width_left = 5
	box.border_width_top = 5
	box.border_width_right = 5
	box.border_width_bottom = 5
	box.border_color = Color("2c6e68")
	box.corner_radius_top_left = 18
	box.corner_radius_top_right = 18
	box.corner_radius_bottom_right = 18
	box.corner_radius_bottom_left = 18
	box.shadow_color = Color(0.158, 0.158, 0.158, 0.5)
	box.shadow_size = 3
	box.shadow_offset = Vector2(4, 5)
	card.add_theme_stylebox_override("panel", box)
	var card_size := Vector2(150, 150)
	card.position = Vector2(_screen_size().x * 0.58, _screen_size().y * 0.40 - card_size.y * 0.5)
	card.size = card_size
	layer.add_child(card)

	_target_label = Label.new()
	# Plain font here too — the card letter is what the child matches
	# against their physical keyboard, so the glyphs must be identical.
	_target_label.add_theme_font_size_override("font_size", 96)
	_target_label.add_theme_color_override("font_color", Color("2c6e68"))
	_target_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_target_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_target_label.anchor_right = 1.0
	_target_label.anchor_bottom = 1.0
	card.add_child(_target_label)


# ----------------------------------------------------------------
#  Procedural QWERTY keyboard with letter labels
# ----------------------------------------------------------------
func _build_keyboard() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)

	var total_rows := KEY_LAYOUT.size()
	var board_height := total_rows * KEY_SIZE.y + (total_rows - 1) * KEY_GAP
	var top := _screen_size().y * 0.72 - board_height * 0.5

	for row_idx in total_rows:
		var row: String = KEY_LAYOUT[row_idx]
		var count := row.length()
		var row_width := count * KEY_SIZE.x + (count - 1) * KEY_GAP
		var left := _screen_size().x * 0.5 - row_width * 0.5
		var y := top + row_idx * (KEY_SIZE.y + KEY_GAP)
		for col in count:
			var letter := row[col]
			var entry := _make_key_panel(letter)
			var panel: Panel = entry["panel"]
			panel.position = Vector2(left + col * (KEY_SIZE.x + KEY_GAP), y)
			panel.size = KEY_SIZE
			layer.add_child(panel)
			_keys[letter] = entry


func _make_key_panel(letter: String) -> Dictionary:
	var key := Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color(1, 1, 1, 1)
	box.border_width_left = 3
	box.border_width_top = 3
	box.border_width_right = 3
	box.border_width_bottom = 3
	box.border_color = Color("2c6e68")
	box.corner_radius_top_left = 10
	box.corner_radius_top_right = 10
	box.corner_radius_bottom_right = 10
	box.corner_radius_bottom_left = 10
	box.shadow_color = Color(0.158, 0.158, 0.158, 0.4)
	box.shadow_size = 2
	box.shadow_offset = Vector2(2, 3)
	key.add_theme_stylebox_override("panel", box)

	var label := Label.new()
	label.text = letter
	# Deliberately NOT the Coiny display font: its rounded V reads as a U
	# at key-cap size, and these labels must match the child's physical
	# keyboard glyphs exactly. Godot's default sans is unambiguous.
	label.add_theme_font_size_override("font_size", 28)
	label.add_theme_color_override("font_color", Color("2c6e68"))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.anchor_right = 1.0
	label.anchor_bottom = 1.0
	key.add_child(label)

	return {"panel": key, "box": box}


func _flash_key(letter: String, color: Color) -> void:
	if not _keys.has(letter):
		return
	var entry: Dictionary = _keys[letter]
	var box: StyleBoxFlat = entry["box"]
	var panel: Panel = entry["panel"]

	var t := create_tween()
	t.tween_method(func (c: Color) -> void: box.bg_color = c, color, Color(1, 1, 1), 0.5)

	panel.pivot_offset = KEY_SIZE * 0.5
	var st := create_tween()
	st.tween_property(panel, "scale", Vector2.ONE * 1.25, 0.12)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	st.tween_property(panel, "scale", Vector2.ONE, 0.25)


# ----------------------------------------------------------------
#  Round / target flow
# ----------------------------------------------------------------
func _start_round(r: int) -> void:
	_round = r
	_letters = ROUND_POOLS[r].duplicate()
	_letters.shuffle()
	_letter_idx = 0
	_next_letter()


func _next_letter() -> void:
	if _letter_idx >= _letters.size():
		if _round < ROUND_POOLS.size() - 1:
			_say(VOICE_MORE_LETTERS, "More letters are coming — keep going!")
			_start_round(_round + 1)
		else:
			_on_level_finished()
		return
	_target = _letters[_letter_idx]
	_show_target(_target)
	_idle_timer.start()


func _show_target(letter: String) -> void:
	_target_label.text = letter
	# Pop the card's letter in so each new target draws the eye.
	_target_label.pivot_offset = _target_label.size / 2
	_target_label.scale = Vector2.ZERO
	var t := create_tween()
	t.tween_property(_target_label, "scale", Vector2.ONE * 1.15, 0.3)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(_target_label, "scale", Vector2.ONE, 0.12)


# ----------------------------------------------------------------
#  Input: the target key wins; any other key gets gentle coaching.
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if _finished or _target == "" or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	_idle_timer.start()

	var pressed := OS.get_keycode_string(key.keycode).to_upper()
	if pressed == _target:
		_flash_key(_target, Color("06d6a0"))
		_play_chime()
		Confetti.rain(16, 0.25)
		# No recording exists for a specific letter name, so this stays
		# text-only — the chime above is the audio feedback here.
		_say(null, "Yes! You found the letter %s!" % _target)
		_target = ""
		_letter_idx += 1
		get_tree().create_timer(1.0).timeout.connect(_next_letter)
	elif _keys.has(pressed):
		# A real letter, just not this one — wiggle it kindly, no red.
		_flash_key(pressed, Color("ffe9b3"))
		_say(VOICE_ALMOST_KEEP_LOOKING, "Almost — keep looking for the letter %s!" % _target)
	# Non-letter keys (space, arrows...) are silently ignored.


# ----------------------------------------------------------------
#  Idle hint: the target key glows — the keyboard ghost-cursor.
# ----------------------------------------------------------------
func _on_idle_hint() -> void:
	if _finished or _target == "" or not _keys.has(_target):
		return
	_say(VOICE_PRESS_WHEN_YOU_SEE, "Press it when you see it!")
	var box: StyleBoxFlat = (_keys[_target] as Dictionary)["box"]
	if _hint_tween:
		_hint_tween.kill()
	_hint_tween = create_tween()
	for i in 3:
		_hint_tween.tween_method(
			func (c: Color) -> void: box.bg_color = c,
			Color(1, 1, 1), Color("ffd166"), 0.3
		).set_trans(Tween.TRANS_SINE)
		_hint_tween.tween_method(
			func (c: Color) -> void: box.bg_color = c,
			Color("ffd166"), Color(1, 1, 1), 0.3
		).set_trans(Tween.TRANS_SINE)
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
	_say(VOICE_AMAZING_FOUND_ALL, "Amazing! You found every single letter!")
	get_tree().create_timer(2.5).timeout.connect(_on_celebration_finished)


func _on_celebration_finished() -> void:
	level_completed.emit(LEVEL_NUMBER)
	var err := get_tree().change_scene_to_file(NEXT_SCENE)
	if err != OK:
		# Level 5 doesn't exist yet in this prototype — stay put instead
		# of crashing, and start the letter hunt over.
		_finished = false
		_say(VOICE_CAN_YOU_FIND, "Can you find this letter on your keyboard?")
		_start_round(0)


# ----------------------------------------------------------------
#  UI: one short text line + speaker button (same pattern as 1–3)
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
#  Narration: recorded voice clips (audio-first), text line synced.
#  clip may be null for the one dynamic per-letter line that has no
#  matching recording — the text still updates, audio just stays put.
# ----------------------------------------------------------------
func _say(clip: AudioStream, text: String) -> void:
	_current_instruction = text
	_instruction_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ text
		+ "[/rainbow][/center]"
	)
	if clip:
		_current_clip = clip
		_voice.stop()            # never overlap two voice lines
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
