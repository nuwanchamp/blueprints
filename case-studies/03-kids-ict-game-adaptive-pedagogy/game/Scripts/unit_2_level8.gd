# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — LEVEL 8 — "Falling Letters"  (BOSS LEVEL, prototype)
#  Skill: timed key-matching
#
#  PROTOTYPE NOTE: narration uses the recorded voice clips in
#  Assets/unit2-level8/, same audio-first pattern as Levels 1–7
#  (see _say()). The two dynamic lines that name a specific
#  letter or count don't have per-value recordings, so their
#  clips are generic encouragement — the text still shows the
#  real value. Zig (the keyboard-bodied mascot) stands in for
#  Pip here, same as Levels 1–7; the falling letters and basket
#  stay procedural (plain default font so the glyphs match the
#  child's physical keyboard).
#
#  MECHANIC (per Keyboard_Skills_Adventure_Level_Plan.md)
#  - One letter at a time drifts down from the top. Pressing its
#    key before it lands pops it into Zig's basket.
#  - Landing is never punished: the letter just poofs away and a
#    new one falls. But after 2 landings the MERCY mechanic kicks
#    in — everything falls slowly for the next few letters, so
#    the boss level stays exciting, never frustrating.
#  - Speed creeps up a little with every catch (the hidden ramp).
#  - After 12 catches the basket is full and the level ends.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 17   # StarChart badge slot (Unit 2 starts at 11)
const NEXT_SCENE := "res://Scenes/unit2-level9.tscn"   # placeholder — level 9 not built yet

const CATCHES_TO_WIN := 12
const IDLE_HINT_SECONDS := 8.0

const BASE_FALL_SPEED := 70.0     # px/s for the first letter
const SPEED_PER_CATCH := 6.0      # hidden ramp
const MAX_FALL_SPEED := 140.0
const MERCY_SPEED := 42.0         # after 2 landings, this gentle speed...
const MERCY_LETTERS := 3          # ...for this many letters
const MISSES_FOR_MERCY := 2

const LETTER_POOL := ["A", "O", "M", "T", "S", "P", "W", "K", "E", "R", "N", "B"]

const COL_BG   := Color("e0f7f4")   # same fresh minty pastel as levels 1–7
const GOLD := Color("ffd166")
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-trans.png")
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

const CARD_SIZE := Vector2(90, 90)
const CARD_COLORS: Array[Color] = [
	Color("ff8fab"), Color("6b7fd7"), Color("06d6a0"), Color("f4a259"), Color("ffd166"),
]

# --- Recorded narration clips ---
const VOICE_INTRO: AudioStream = preload("res://Assets/unit2-level8/uh-oh.mp3")
const VOICE_MERCY: AudioStream = preload("res://Assets/unit2-level8/take-your-time.mp3")
const VOICE_MISSED: AudioStream = preload("res://Assets/unit2-level8/oophs-it-landed.mp3")
const VOICE_ALMOST: AudioStream = preload("res://Assets/unit2-level8/press-right-key.mp3")
const VOICE_KEEP_GOING: AudioStream = preload("res://Assets/unit2-level8/keep-going.mp3")
const VOICE_IDLE_HINT: AudioStream = preload("res://Assets/unit2-level8/press-before-lands.mp3")
const VOICE_FINISH: AudioStream = preload("res://Assets/unit2-level8/basket-is-full.mp3")
const VOICE_REPLAY: AudioStream = preload("res://Assets/unit2-level8/more-letters-are-falling.mp3")

var _caught := 0
var _misses := 0
var _mercy_left := 0
var _finished := false
var _falling := false             # a letter is currently in the air

var _card: Panel
var _card_letter := ""
var _last_letter := ""
var _fall_speed := BASE_FALL_SPEED
var _ground_y := 0.0

var _zig: Sprite2D
var _basket: Panel
var _basket_layer: CanvasLayer
var _pile: Array[Panel] = []      # little caught-letter chips on the rim
var _idle_timer: Timer
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _current_instruction := "Press the right key before the letter lands!"
var _current_clip: AudioStream = VOICE_ALMOST


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

	_ground_y = _screen_size().y - 190.0

	_build_zig_and_basket()
	_build_ui()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_INTRO, "Uh oh, letters are falling! Press the right key before they land!")
	get_tree().create_timer(1.5).timeout.connect(_spawn_letter)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Zig and his basket at the bottom
# ----------------------------------------------------------------
func _build_zig_and_basket() -> void:
	_basket_layer = CanvasLayer.new()
	_basket_layer.layer = 5
	add_child(_basket_layer)

	_zig = Sprite2D.new()
	_zig.texture = ZIG_TEXTURE
	_zig.scale = Vector2.ONE * (330.0 / ZIG_TEXTURE.get_width())
	_zig.position = Vector2(_screen_size().x * 0.5 - 190.0, _screen_size().y - 120.0)
	add_child(_zig)

	var basket_size := Vector2(220, 110)
	_basket = Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color("c98d5a")   # woven-basket brown
	box.border_width_left = 5
	box.border_width_top = 5
	box.border_width_right = 5
	box.border_width_bottom = 5
	box.border_color = Color("8a5a33")
	box.corner_radius_top_left = 8
	box.corner_radius_top_right = 8
	box.corner_radius_bottom_right = 42
	box.corner_radius_bottom_left = 42
	box.shadow_color = Color(0.158, 0.158, 0.158, 0.5)
	box.shadow_size = 3
	box.shadow_offset = Vector2(4, 5)
	_basket.add_theme_stylebox_override("panel", box)
	_basket.position = Vector2(_screen_size().x * 0.5 - basket_size.x * 0.5,
		_screen_size().y - basket_size.y - 40.0)
	_basket.size = basket_size
	_basket_layer.add_child(_basket)


func _basket_center() -> Vector2:
	return _basket.position + _basket.size * 0.5


func _wiggle_basket() -> void:
	_basket.pivot_offset = _basket.size * 0.5
	var t := create_tween()
	t.tween_property(_basket, "rotation", 0.12, 0.08)
	t.tween_property(_basket, "rotation", -0.1, 0.1)
	t.tween_property(_basket, "rotation", 0.0, 0.1)
	t.parallel().tween_property(_basket, "scale", Vector2(1.08, 0.94), 0.1)
	t.tween_property(_basket, "scale", Vector2.ONE, 0.15)


func _add_pile_chip() -> void:
	# A small colored chip peeks over the basket rim for every catch,
	# so the child literally watches the basket fill up.
	var chip := Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = CARD_COLORS[_pile.size() % CARD_COLORS.size()]
	box.corner_radius_top_left = 6
	box.corner_radius_top_right = 6
	box.corner_radius_bottom_right = 6
	box.corner_radius_bottom_left = 6
	box.border_width_left = 2
	box.border_width_top = 2
	box.border_width_right = 2
	box.border_width_bottom = 2
	box.border_color = Color("8a5a33")
	chip.add_theme_stylebox_override("panel", box)
	var chip_w := 26.0
	var per_row := 7
	var row := floori(float(_pile.size()) / float(per_row))
	var col := _pile.size() % per_row
	chip.position = _basket.position + Vector2(
		14.0 + col * (chip_w + 3.0),
		-14.0 - row * 16.0
	)
	chip.size = Vector2(chip_w, 22)
	_basket_layer.add_child(chip)
	_pile.append(chip)


# ----------------------------------------------------------------
#  Falling letters
# ----------------------------------------------------------------
func _spawn_letter() -> void:
	if _finished:
		return

	# Pick a letter (never the same twice in a row).
	var letter: String = LETTER_POOL[randi() % LETTER_POOL.size()]
	while letter == _last_letter:
		letter = LETTER_POOL[randi() % LETTER_POOL.size()]
	_last_letter = letter
	_card_letter = letter

	_card = Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color(1, 1, 1, 1)
	box.border_width_left = 4
	box.border_width_top = 4
	box.border_width_right = 4
	box.border_width_bottom = 4
	box.border_color = CARD_COLORS[randi() % CARD_COLORS.size()]
	box.corner_radius_top_left = 16
	box.corner_radius_top_right = 16
	box.corner_radius_bottom_right = 16
	box.corner_radius_bottom_left = 16
	box.shadow_color = Color(0.158, 0.158, 0.158, 0.4)
	box.shadow_size = 3
	box.shadow_offset = Vector2(3, 4)
	_card.add_theme_stylebox_override("panel", box)
	var s := _screen_size()
	_card.position = Vector2(randf_range(s.x * 0.15, s.x * 0.85 - CARD_SIZE.x), -CARD_SIZE.y)
	_card.size = CARD_SIZE
	_basket_layer.add_child(_card)

	var label := Label.new()
	label.text = letter
	# Plain default font on purpose — must match physical key glyphs.
	label.add_theme_font_size_override("font_size", 48)
	label.add_theme_color_override("font_color", Color("2c6e68"))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.anchor_right = 1.0
	label.anchor_bottom = 1.0
	_card.add_child(label)

	# Gentle sway while falling, so it drifts rather than plummets.
	var sway := create_tween().set_loops()
	var home_x := _card.position.x
	sway.tween_property(_card, "position:x", home_x + 26.0, 0.9)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	sway.tween_property(_card, "position:x", home_x - 26.0, 1.8)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	sway.tween_property(_card, "position:x", home_x, 0.9)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	# The card gets freed (caught or landed) while this loop is still
	# running — keep the tween so it can be killed first, otherwise the
	# infinite loop keeps stepping against a freed node.
	_card.set_meta("sway_tween", sway)

	_falling = true
	_idle_timer.start()


func _current_speed() -> float:
	if _mercy_left > 0:
		return MERCY_SPEED
	return minf(BASE_FALL_SPEED + SPEED_PER_CATCH * _caught, MAX_FALL_SPEED)


func _process(delta: float) -> void:
	if _finished or not _falling or _card == null:
		return
	_card.position.y += _current_speed() * delta
	if _card.position.y >= _ground_y:
		_on_letter_landed()


func _on_letter_landed() -> void:
	_falling = false
	_idle_timer.stop()
	var card := _card
	_card = null
	(card.get_meta("sway_tween") as Tween).kill()

	# Landing is soft: the letter just poofs, no sad sound, no penalty.
	var t := create_tween()
	t.tween_property(card, "scale", Vector2(1.3, 0.5), 0.15)
	t.parallel().tween_property(card, "modulate:a", 0.0, 0.3)
	t.tween_callback(card.queue_free)

	_misses += 1
	if _misses >= MISSES_FOR_MERCY and _mercy_left <= 0:
		_misses = 0
		_mercy_left = MERCY_LETTERS
		_say(VOICE_MERCY, "Take your time! The letters will float down slowly now.")
	else:
		_say(VOICE_MISSED, "Whoops, it landed! Here comes another one!")

	get_tree().create_timer(1.2).timeout.connect(_spawn_letter)


# ----------------------------------------------------------------
#  Input
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if _finished or not _falling or _card == null or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	_idle_timer.start()

	var pressed := OS.get_keycode_string(key.keycode).to_upper()
	if pressed == _card_letter:
		_catch_letter()
	elif pressed.length() == 1 and pressed >= "A" and pressed <= "Z":
		# Wrong letter: the falling card wobbles kindly; no penalty.
		var home_rot := _card.rotation
		var t := create_tween()
		t.tween_property(_card, "rotation", home_rot + 0.15, 0.06)
		t.tween_property(_card, "rotation", home_rot - 0.15, 0.06)
		t.tween_property(_card, "rotation", home_rot, 0.06)
		_say(VOICE_ALMOST, "Almost — that one is the letter %s!" % _card_letter)
	# Non-letter keys are silently ignored.


func _catch_letter() -> void:
	_falling = false
	_idle_timer.stop()
	if _mercy_left > 0:
		_mercy_left -= 1
	_caught += 1

	var card := _card
	_card = null
	(card.get_meta("sway_tween") as Tween).kill()
	_play_chime()
	Confetti.rain(12, 0.2, Vector2(card.position.x, card.position.x + CARD_SIZE.x))

	# The letter dives happily into the basket.
	card.pivot_offset = CARD_SIZE * 0.5
	var t := create_tween()
	t.tween_property(card, "position", _basket_center() - CARD_SIZE * 0.5, 0.45)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	t.parallel().tween_property(card, "scale", Vector2.ONE * 0.25, 0.45)
	t.parallel().tween_property(card, "rotation", 0.6, 0.45)
	t.tween_callback(card.queue_free)
	t.tween_callback(_wiggle_basket)
	t.tween_callback(_add_pile_chip)

	if _caught >= CATCHES_TO_WIN:
		get_tree().create_timer(0.7).timeout.connect(_on_level_finished)
	else:
		if _caught % 4 == 0:
			_say(VOICE_KEEP_GOING, "%d letters in the basket! Keep going!" % _caught)
		get_tree().create_timer(1.0).timeout.connect(_spawn_letter)


# ----------------------------------------------------------------
#  Idle hint: flash the falling letter and name it out loud.
# ----------------------------------------------------------------
func _on_idle_hint() -> void:
	if _finished or not _falling or _card == null:
		return
	_say(VOICE_IDLE_HINT, "Press the letter %s before it lands!" % _card_letter)
	var box := _card.get_theme_stylebox("panel") as StyleBoxFlat
	var t := create_tween()
	for i in 3:
		t.tween_method(func (c: Color) -> void: box.bg_color = c,
			Color(1, 1, 1), GOLD, 0.25).set_trans(Tween.TRANS_SINE)
		t.tween_method(func (c: Color) -> void: box.bg_color = c,
			GOLD, Color(1, 1, 1), 0.25).set_trans(Tween.TRANS_SINE)
	_idle_timer.start()


# ----------------------------------------------------------------
#  Finish
# ----------------------------------------------------------------
func _on_level_finished() -> void:
	_finished = true
	_idle_timer.stop()
	Confetti.rain()
	_wiggle_basket()
	StarChart.show_chart(StarChart.UNIT_2_LEVELS)
	StarChart.add_star(LEVEL_NUMBER)
	_say(VOICE_FINISH, "The basket is full! You beat the falling letters!")
	get_tree().create_timer(2.5).timeout.connect(_on_celebration_finished)


func _on_celebration_finished() -> void:
	level_completed.emit(LEVEL_NUMBER)
	var err := get_tree().change_scene_to_file(NEXT_SCENE)
	if err != OK:
		# Level 9 doesn't exist yet in this prototype — stay put instead
		# of crashing, and empty the basket for another round.
		_finished = false
		_caught = 0
		_misses = 0
		_mercy_left = 0
		for chip in _pile:
			chip.queue_free()
		_pile.clear()
		_say(VOICE_REPLAY, "Uh oh, more letters are falling! Catch them!")
		get_tree().create_timer(1.2).timeout.connect(_spawn_letter)


# ----------------------------------------------------------------
#  UI: one short text line + speaker button (same pattern as 1–7)
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
