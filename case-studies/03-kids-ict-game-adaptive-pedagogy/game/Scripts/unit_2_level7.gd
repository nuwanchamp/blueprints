# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — LEVEL 7 — "Letter Parade"  (prototype)
#  Skill: finding letters in a short sequence
#
#  PROTOTYPE NOTE: narration uses the recorded voice clips in
#  Assets/unit2-level7/, same audio-first pattern as Levels 1–6
#  (see _say()). One clip in that folder, pop-the-bubbles.mp3, has
#  no matching line in this level's current text (an earlier
#  "bubble pop" wording, before the parade text was finalized) and
#  is left unused. Zig (the keyboard-bodied mascot) stands in for
#  Pip here, same as Levels 1–6; the parade cards stay procedural
#  (rounded-panel style, plain default font so the glyphs match
#  the child's physical keyboard).
#
#  MECHANIC (per Keyboard_Skills_Adventure_Level_Plan.md)
#  - Letter cards march in from the right and queue up behind a
#    little fence, with Zig waiting just beyond it.
#  - The FRONT card glows and waits; pressing its key sends it
#    hopping OVER the fence with confetti, gliding into Zig and
#    shrinking away as if hopping right into him, and the parade
#    steps forward.
#  - A missed/wrong letter just waits a moment longer — gentle
#    coaching, no restart, no penalty.
#  - 3 parades: 4 easy letters, then 4 middling, then 5 with
#    look-alike neighbours — the hidden difficulty ramp.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 16   # StarChart badge slot (Unit 2 starts at 11)
const NEXT_SCENE := "res://Scenes/unit2-level8.tscn"   # placeholder — level 8 not built yet

const IDLE_HINT_SECONDS := 8.0

# One letter sequence per parade; each is shuffled on play.
const PARADES := [
	["A", "O", "M", "T"],
	["S", "P", "W", "K"],
	["E", "R", "I", "O", "U"],
]

const COL_BG   := Color("e0f7f4")   # same fresh minty pastel as levels 1–6
const GOLD := Color("ffd166")
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-trans.png")
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

const BASE_CARD_SIZE := Vector2(96, 96)
const BASE_CARD_GAP := 26.0
const BASE_CARD_FONT_SIZE := 52
const MIN_CARD_SHRINK := 0.55        # never shrink cards below this fraction of full size
const RIGHT_MARGIN := 40.0           # clearance kept at the screen's right edge

const ZIG_WIDTH := 240.0                # smaller than usual, to leave room for the fence gaps
const FENCE_TEXTURE: Texture2D = preload("res://Assets/unit2-level6/fence.png")
const FENCE_HEIGHT := 150.0             # on-screen height in px
const GATE_TO_FENCE_GAP := 150.0        # breathing room between the queue and the fence
const FENCE_TO_ZIG_GAP := 210.0         # breathing room between the fence and Zig

# --- Recorded narration clips ---
const VOICE_HELP_LETTERS: AudioStream = preload("res://Assets/unit2-level7/help-letters.mp3")
const VOICE_ALMOST_PRESS: AudioStream = preload("res://Assets/unit2-level7/almost-press-the-letter.mp3")
const VOICE_PRESS_LETTER: AudioStream = preload("res://Assets/unit2-level7/press-the-letter.mp3")
const VOICE_PARADE_DONE: AudioStream = preload("res://Assets/unit2-level7/that-parade-is-done.mp3")
const VOICE_KEEP_POPPING: AudioStream = preload("res://Assets/unit2-level7/keep-popping.mp3")

var _parade := 0
var _cards: Array[Dictionary] = []   # front first: {panel, box, letter}
var _accepting := false
var _finished := false

var _card_size := BASE_CARD_SIZE     # shrunk to fit if the widest parade wouldn't fit on-screen
var _card_gap := BASE_CARD_GAP
var _card_font_size := BASE_CARD_FONT_SIZE

var _zig: Sprite2D
var _gate_x := 0.0                   # where the front card stops (behind the fence)
var _fence_x := 0.0                  # where cards jump over, on the way to Zig
var _parade_y := 0.0
var _front_pulse: Tween
var _idle_timer: Timer
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _current_instruction := "Press each letter as it reaches me!"
var _current_clip: AudioStream = VOICE_PRESS_LETTER


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

	_gate_x = _screen_size().x * 0.42
	_parade_y = _screen_size().y * 0.52
	_fence_x = _gate_x - GATE_TO_FENCE_GAP
	_fit_cards_to_screen()

	_build_zig()
	_build_fence()
	_build_ui()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_HELP_LETTERS, "Help the letter parade march by! Press each letter as it reaches me!")
	_start_parade(0)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


## Shrinks the card size (and its gap/font) just enough that the widest
## parade's full queue fits between the gate and the right edge — so a
## narrower window never runs the last few letters off-screen.
func _fit_cards_to_screen() -> void:
	var max_cards := 0
	for pool in PARADES:
		max_cards = maxi(max_cards, pool.size())

	var available := _screen_size().x - _gate_x - RIGHT_MARGIN
	var needed := max_cards * BASE_CARD_SIZE.x + (max_cards - 1) * BASE_CARD_GAP
	var shrink := 1.0
	if needed > available and available > 0.0:
		shrink = maxf(available / needed, MIN_CARD_SHRINK)

	_card_size = BASE_CARD_SIZE * shrink
	_card_gap = BASE_CARD_GAP * shrink
	_card_font_size = int(BASE_CARD_FONT_SIZE * shrink)


# ----------------------------------------------------------------
#  Zig stands at the parade gate.
# ----------------------------------------------------------------
func _build_zig() -> void:
	_zig = Sprite2D.new()
	_zig.texture = ZIG_TEXTURE
	_zig.scale = Vector2.ONE * (ZIG_WIDTH / ZIG_TEXTURE.get_width())
	_zig.position = Vector2(_fence_x - FENCE_TO_ZIG_GAP, _parade_y)
	add_child(_zig)


# ----------------------------------------------------------------
#  A little fence between the queue and Zig — cards hop over it
#  on their way in.
# ----------------------------------------------------------------
func _build_fence() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 4   # above Zig (world layer), below the marching cards (5)
	add_child(layer)

	var ground_y := _parade_y + _card_size.y * 0.5
	var fence := Sprite2D.new()
	fence.texture = FENCE_TEXTURE
	fence.scale = Vector2.ONE * (FENCE_HEIGHT / FENCE_TEXTURE.get_height())
	fence.position = Vector2(_fence_x + 30, ground_y - FENCE_HEIGHT * 0.26)
	layer.add_child(fence)


# ----------------------------------------------------------------
#  Parade construction and marching
# ----------------------------------------------------------------
func _start_parade(p: int) -> void:
	_parade = p
	_accepting = false

	var letters: Array = PARADES[p].duplicate()
	letters.shuffle()

	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)

	# Spawn every card off the right edge, already in queue order.
	var s := _screen_size()
	for i in letters.size():
		var entry := _make_card(letters[i])
		var panel: Panel = entry["panel"]
		panel.position = Vector2(s.x + 60.0 + i * (_card_size.x + _card_gap),
			_parade_y - _card_size.y * 0.5)
		layer.add_child(panel)
		_cards.append(entry)

	# March everyone in to their queue slots together.
	for i in _cards.size():
		var panel: Panel = _cards[i]["panel"]
		var t := create_tween()
		t.tween_property(panel, "position:x", _slot_x(i), 1.2)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	get_tree().create_timer(1.3).timeout.connect(_on_parade_ready)


func _on_parade_ready() -> void:
	if _finished:
		return
	_accepting = true
	_highlight_front()
	_idle_timer.start()


func _slot_x(queue_index: int) -> float:
	return _gate_x + queue_index * (_card_size.x + _card_gap)


func _make_card(letter: String) -> Dictionary:
	var card := Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color(1, 1, 1, 1)
	box.border_width_left = 4
	box.border_width_top = 4
	box.border_width_right = 4
	box.border_width_bottom = 4
	box.border_color = Color("2c6e68")
	box.corner_radius_top_left = 16
	box.corner_radius_top_right = 16
	box.corner_radius_bottom_right = 16
	box.corner_radius_bottom_left = 16
	box.shadow_color = Color(0.158, 0.158, 0.158, 0.4)
	box.shadow_size = 3
	box.shadow_offset = Vector2(3, 4)
	card.add_theme_stylebox_override("panel", box)
	card.size = _card_size

	var label := Label.new()
	label.text = letter
	# Plain default font on purpose — must match physical key glyphs.
	label.add_theme_font_size_override("font_size", _card_font_size)
	label.add_theme_color_override("font_color", Color("2c6e68"))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.anchor_right = 1.0
	label.anchor_bottom = 1.0
	card.add_child(label)

	return {"panel": card, "box": box, "letter": letter}


func _highlight_front() -> void:
	if _cards.is_empty():
		return
	var front: Dictionary = _cards[0]
	var box: StyleBoxFlat = front["box"]
	if _front_pulse:
		_front_pulse.kill()
	_front_pulse = create_tween().set_loops()
	_front_pulse.tween_method(func (c: Color) -> void: box.bg_color = c,
		Color(1, 1, 1), Color("ffe9b3"), 0.5).set_trans(Tween.TRANS_SINE)
	_front_pulse.tween_method(func (c: Color) -> void: box.bg_color = c,
		Color("ffe9b3"), Color(1, 1, 1), 0.5).set_trans(Tween.TRANS_SINE)


# ----------------------------------------------------------------
#  Input
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if _finished or not _accepting or _cards.is_empty() or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	_idle_timer.start()

	var pressed := OS.get_keycode_string(key.keycode).to_upper()
	var target: String = _cards[0]["letter"]
	if pressed == target:
		_pass_front_card()
	elif pressed.length() == 1 and pressed >= "A" and pressed <= "Z":
		# Wrong letter: the front card shakes its head kindly; no penalty.
		_shake_front()
		_say(VOICE_ALMOST_PRESS, "Almost — press the letter %s!" % target)
	# Non-letter keys are silently ignored.


func _pass_front_card() -> void:
	if _front_pulse:
		_front_pulse.kill()
	var front: Dictionary = _cards.pop_front()
	var panel: Panel = front["panel"]
	(front["box"] as StyleBoxFlat).bg_color = Color("b8f2d8")

	_play_chime()
	Confetti.rain(12, 0.2, Vector2(panel.position.x, panel.position.x + _card_size.x))

	# The card hops over the fence, lands, then glides into Zig and
	# shrinks away — as if hopping right into him.
	panel.pivot_offset = _card_size * 0.5
	var t := create_tween()
	t.tween_property(panel, "position:y", panel.position.y - 90.0, 0.22)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.parallel().tween_property(panel, "position:x", _fence_x - _card_size.x * 0.5, 0.22)
	t.tween_property(panel, "position:y", panel.position.y, 0.22)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	t.tween_property(panel, "position:x", _zig.position.x - _card_size.x * 0.5, 0.35)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	t.parallel().tween_property(panel, "scale", Vector2.ZERO, 0.35)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	t.parallel().tween_property(panel, "modulate:a", 0.0, 0.3)
	t.tween_callback(panel.queue_free)

	# Everyone left in line steps forward one slot.
	for i in _cards.size():
		var p: Panel = _cards[i]["panel"]
		var mt := create_tween()
		mt.tween_property(p, "position:x", _slot_x(i), 0.4)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)

	if _cards.is_empty():
		_accepting = false
		_idle_timer.stop()
		if _parade < PARADES.size() - 1:
			_say(VOICE_PARADE_DONE, "That parade is done! Here comes the next one!")
			get_tree().create_timer(1.4).timeout.connect(
				func () -> void:
					if not _finished:
						_start_parade(_parade + 1)
			)
		else:
			_on_level_finished()
	else:
		_highlight_front()


func _shake_front() -> void:
	if _cards.is_empty():
		return
	var panel: Panel = _cards[0]["panel"]
	var home_x := panel.position.x
	var t := create_tween()
	t.tween_property(panel, "position:x", home_x - 10.0, 0.06)
	t.tween_property(panel, "position:x", home_x + 10.0, 0.06)
	t.tween_property(panel, "position:x", home_x, 0.06)


# ----------------------------------------------------------------
#  Idle hint: bounce the front card and repeat the line.
# ----------------------------------------------------------------
func _on_idle_hint() -> void:
	if _finished or not _accepting or _cards.is_empty():
		return
	var target: String = _cards[0]["letter"]
	_say(VOICE_PRESS_LETTER, "Press the letter %s — it's waiting for you!" % target)
	var panel: Panel = _cards[0]["panel"]
	var home_y := panel.position.y
	var t := create_tween()
	for i in 2:
		t.tween_property(panel, "position:y", home_y - 24.0, 0.18)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		t.tween_property(panel, "position:y", home_y, 0.18)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
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
	_say(VOICE_KEEP_POPPING, "What a parade! You matched every letter!")
	get_tree().create_timer(2.5).timeout.connect(_on_celebration_finished)


func _on_celebration_finished() -> void:
	level_completed.emit(LEVEL_NUMBER)
	var err := get_tree().change_scene_to_file(NEXT_SCENE)
	if err != OK:
		# Level 8 doesn't exist yet in this prototype — stay put instead
		# of crashing, and march a fresh parade in.
		_finished = false
		_say(VOICE_HELP_LETTERS, "Help the letter parade march by! Press each letter as it reaches me!")
		_start_parade(0)


# ----------------------------------------------------------------
#  UI: one short text line + speaker button (same pattern as 1–6)
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
