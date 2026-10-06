# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — LEVEL 6 — "Magic Enter"  (prototype)
#  Skill: a second precise single key — Enter means "confirm/go"
#
#  PROTOTYPE NOTE: narration uses the recorded voice clips in
#  Assets/unit1-level6/ (named for the folder they were dropped
#  in, but their content — "another door", "enter expert", "look
#  for enter key" — matches this level's Magic Enter mechanic, not
#  Unit 1's current kitty-poke Level 6), same audio-first pattern
#  as Levels 1–5 (see _say()). Zig (the keyboard-bodied mascot)
#  stands in for Pip here, same as Levels 1–5. The "door" is one
#  of Unit 1's animated animal houses (bunny/chick/puppy — real
#  art already in the project), picked at random each time.
#
#  MECHANIC (per Keyboard_Skills_Adventure_Level_Plan.md)
#  - Zig stands beside a big glowing house with a "Ready?" bubble.
#  - A wide ENTER key pulses at the bottom of the screen (the
#    same treatment the spacebar got in Level 3).
#  - Each ENTER press opens the house's door: confetti plus its
#    animal popping out to wave hello.
#  - Other keys are never wrong — just a gentle pointer to the
#    ENTER key. No fail states.
#  - After 4 houses (one per animal) Zig does a happy spin and the
#    level ends.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 15   # StarChart badge slot (Unit 2 starts at 11)
const NEXT_SCENE := "res://Scenes/unit2-level7.tscn"   # placeholder — level 7 not built yet

const DOORS_TO_WIN := 4
const IDLE_HINT_SECONDS := 8.0

const COL_BG   := Color("e0f7f4")   # same fresh minty pastel as levels 1–5
const GOLD := Color("ffd166")
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-trans.png")
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# The "door" — one of Unit 1's animated animal houses. One door per
# animal, shuffled once per playthrough so all four appear exactly once
# and none repeats. All four share the same closed/slight-open house art
# as their first frames, so that shared texture is enough for sizing math.
const HOUSE_SCENES: Array[PackedScene] = [
	preload("res://Scenes/unit1-level-4/animated-bunny-house.tscn"),
	preload("res://Scenes/unit1-level-4/animated-chick-house.tscn"),
	preload("res://Scenes/unit1-level-4/animated-puppy-house.tscn"),
	preload("res://Scenes/unit1-level-4/animated-kitty-house.tscn"),
]
const HOUSE_SIZING_TEXTURE: Texture2D = preload("res://Assets/bunny-house/house-cloased.png")
const HOUSE_HEIGHT := 320.0   # on-screen height in px

# --- Recorded narration clips ---
const VOICE_WHEN_READY: AudioStream = preload("res://Assets/unit1-level6/when-ready.mp3")
const VOICE_WHEN_READY_REPLAY: AudioStream = preload("res://Assets/unit1-level6/when-ready-2.mp3")
const VOICE_ANOTHER_DOOR: AudioStream = preload("res://Assets/unit1-level6/another-door.mp3")
const VOICE_LOOK_FOR_ENTER: AudioStream = preload("res://Assets/unit1-level6/look-for-enter-key.mp3")
const VOICE_ENTER_EXPERT: AudioStream = preload("res://Assets/unit1-level6/enter-expert.mp3")

var _house_order: Array[PackedScene] = []   # shuffled HOUSE_SCENES, drawn in order
var _doors_opened := 0
var _door_busy := false
var _finished := false

var _zig: Sprite2D
var _house_layer: CanvasLayer
var _house_pos := Vector2.ZERO
var _house: Node2D
var _house_anim: AnimatedSprite2D
var _house_pulse: Tween
var _bubble: Label
var _enter_key: Panel
var _enter_box: StyleBoxFlat
var _idle_timer: Timer
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _current_instruction := "When you're ready, press ENTER to open the door!"
var _current_clip: AudioStream = VOICE_WHEN_READY


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
	_build_house()
	_build_enter_key()
	_build_ui()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)
	_idle_timer.start()

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_WHEN_READY, "When you're ready, press ENTER to open the door!")


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Zig
# ----------------------------------------------------------------
func _build_zig() -> void:
	_zig = Sprite2D.new()
	_zig.texture = ZIG_TEXTURE
	_zig.scale = Vector2.ONE * (380.0 / ZIG_TEXTURE.get_width())
	_zig.position = Vector2(_screen_size().x * 0.28, _screen_size().y * 0.48)
	add_child(_zig)


func _zig_happy_spin() -> void:
	var t := create_tween()
	t.tween_property(_zig, "rotation", TAU, 0.7)\
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	t.tween_callback(func () -> void: _zig.rotation = 0.0)


# ----------------------------------------------------------------
#  The house: one of Unit 1's animated animal houses, standing in
#  for a door. Opening it plays that house's "house-open" animal
#  reveal instead of a generic emoji pop.
# ----------------------------------------------------------------
func _build_house() -> void:
	_house_layer = CanvasLayer.new()
	_house_layer.layer = 5
	add_child(_house_layer)

	_house_pos = Vector2(_screen_size().x * 0.64, _screen_size().y * 0.54)

	# "Ready?" bubble above the house.
	_bubble = Label.new()
	_bubble.text = "Ready?"
	_bubble.add_theme_font_override("font", UI_FONT)
	_bubble.add_theme_font_size_override("font_size", 30)
	_bubble.add_theme_color_override("font_color", Color("2c6e68"))
	_bubble.position = Vector2(_house_pos.x - 55, _house_pos.y - HOUSE_HEIGHT * 0.5 - 56)
	_house_layer.add_child(_bubble)

	_shuffle_house_order()
	_spawn_house()


func _shuffle_house_order() -> void:
	_house_order = HOUSE_SCENES.duplicate()
	_house_order.shuffle()


func _spawn_house() -> void:
	var scene: PackedScene = _house_order[_doors_opened]
	_house = scene.instantiate()
	_house_anim = _house.get_node("AnimatedSprite2D") as AnimatedSprite2D
	_house_anim.animation = "default"
	_house_anim.play()
	_house.scale = Vector2.ONE * (HOUSE_HEIGHT / HOUSE_SIZING_TEXTURE.get_height())
	_house.position = _house_pos
	_house_layer.add_child(_house)
	_start_house_glow()


func _start_house_glow() -> void:
	if _house_pulse:
		_house_pulse.kill()
	_house_pulse = create_tween().set_loops()
	_house_pulse.tween_property(_house, "modulate", Color(1.15, 1.15, 1.0), 0.7)\
		.set_trans(Tween.TRANS_SINE)
	_house_pulse.tween_property(_house, "modulate", Color.WHITE, 0.7)\
		.set_trans(Tween.TRANS_SINE)


func _open_door() -> void:
	_door_busy = true
	_doors_opened += 1
	if _house_pulse:
		_house_pulse.kill()
	_house.modulate = Color.WHITE

	_flash_enter()
	_play_chime()
	Confetti.rain(30, 0.5)

	_house_anim.animation_finished.connect(_on_house_opened, CONNECT_ONE_SHOT)
	_house_anim.animation = "house-open"
	_house_anim.play()


func _on_house_opened() -> void:
	# Give the child a moment to see the animal before moving on.
	get_tree().create_timer(1.0).timeout.connect(_next_door)


func _next_door() -> void:
	_house.queue_free()
	if _doors_opened >= DOORS_TO_WIN:
		_on_level_finished()
		return

	_spawn_house()
	_door_busy = false
	_idle_timer.start()
	_say(VOICE_ANOTHER_DOOR, "Another door! Press ENTER to open it!")


# ----------------------------------------------------------------
#  The big on-screen ENTER key (level 3's spacebar treatment).
# ----------------------------------------------------------------
func _build_enter_key() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)

	var key_size := Vector2(240, 58)
	_enter_key = Panel.new()
	_enter_box = StyleBoxFlat.new()
	_enter_box.bg_color = Color(1, 1, 1, 1)
	_enter_box.border_width_left = 4
	_enter_box.border_width_top = 4
	_enter_box.border_width_right = 4
	_enter_box.border_width_bottom = 4
	_enter_box.border_color = Color("e8a020")
	_enter_box.corner_radius_top_left = 10
	_enter_box.corner_radius_top_right = 10
	_enter_box.corner_radius_bottom_right = 10
	_enter_box.corner_radius_bottom_left = 10
	_enter_box.shadow_color = Color(0.158, 0.158, 0.158, 0.4)
	_enter_box.shadow_size = 2
	_enter_box.shadow_offset = Vector2(2, 3)
	_enter_key.add_theme_stylebox_override("panel", _enter_box)
	_enter_key.position = Vector2(_screen_size().x * 0.5 - key_size.x * 0.5,
		_screen_size().y - 110.0)
	_enter_key.size = key_size
	layer.add_child(_enter_key)

	var label := Label.new()
	label.text = "ENTER ⏎"
	label.add_theme_font_size_override("font_size", 26)
	label.add_theme_color_override("font_color", Color("2c6e68"))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.anchor_right = 1.0
	label.anchor_bottom = 1.0
	_enter_key.add_child(label)

	# Gentle glow loop so the target key is unmistakable without words.
	var pulse := create_tween().set_loops()
	pulse.tween_method(func (c: Color) -> void: _enter_box.bg_color = c,
		Color(1, 1, 1), Color("ffe9b3"), 0.6).set_trans(Tween.TRANS_SINE)
	pulse.tween_method(func (c: Color) -> void: _enter_box.bg_color = c,
		Color("ffe9b3"), Color(1, 1, 1), 0.6).set_trans(Tween.TRANS_SINE)


func _flash_enter() -> void:
	_enter_key.pivot_offset = _enter_key.size * 0.5
	var t := create_tween()
	t.tween_property(_enter_key, "scale", Vector2(1.06, 1.2), 0.1)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(_enter_key, "scale", Vector2.ONE, 0.2)


# ----------------------------------------------------------------
#  Input: ENTER opens; other keys get a gentle pointer, never a fail.
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if _finished or _door_busy or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	_idle_timer.start()

	if key.keycode == KEY_ENTER or key.keycode == KEY_KP_ENTER:
		_open_door()
	else:
		_say(VOICE_LOOK_FOR_ENTER, "Almost! Look for the big ENTER key!")


func _on_idle_hint() -> void:
	if _finished or _door_busy:
		return
	_say(_current_clip, _current_instruction)
	_flash_enter()
	_idle_timer.start()


# ----------------------------------------------------------------
#  Finish
# ----------------------------------------------------------------
func _on_level_finished() -> void:
	_finished = true
	_idle_timer.stop()
	Confetti.rain()
	_zig_happy_spin()
	StarChart.show_chart(StarChart.UNIT_2_LEVELS)
	StarChart.add_star(LEVEL_NUMBER)
	_say(VOICE_ENTER_EXPERT, "Four doors! You're an ENTER expert!")
	get_tree().create_timer(2.5).timeout.connect(_on_celebration_finished)


func _on_celebration_finished() -> void:
	level_completed.emit(LEVEL_NUMBER)
	var err := get_tree().change_scene_to_file(NEXT_SCENE)
	if err != OK:
		# Level 7 doesn't exist yet in this prototype — stay put instead
		# of crashing, and bring the doors back.
		_finished = false
		_doors_opened = 0
		_door_busy = false
		_shuffle_house_order()
		_spawn_house()
		_idle_timer.start()
		_say(VOICE_WHEN_READY_REPLAY, "When you're ready, press ENTER to open the door!")


# ----------------------------------------------------------------
#  UI: one short text line + speaker button (same pattern as 1–5)
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
