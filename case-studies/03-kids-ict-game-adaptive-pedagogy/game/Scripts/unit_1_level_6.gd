# =============================================================
#  Mouse Skills Adventure with Pip
#  POKE THE KITTY  (unit_1_level_6)
#  Skill: single LEFT click on a stationary target
#
#  The target is your animated kitty scene:
#      res://Scenes/kitty-poke.tscn   <- ADJUST PATH IF NEEDED
#  Expected: an AnimatedSprite2D with animations
#      "idle"    (sitting, looping)
#      "poked"   (the boop reaction, plays once per click)
#  The script copes whether the sprite is the scene root or a child.
#
#  MECHANIC
#  - Kitty sits in the centre, about 25% of the screen tall,
#    breathing gently while idle.
#  - Hovering switches the cursor to the pointing hand; the first
#    time this happens it is narrated explicitly.
#  - Each LEFT click restarts the "poked" animation with a random
#    silly sound (giggle, boing, whee, or achoo — never the same
#    twice in a row). Clicking again mid-reaction just pokes again.
#  - A RIGHT click gets a gentle correction, never a fail.
#  - After 8 left clicks: "clicking champion!" + the global star.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 6
const CLICKS_TO_WIN := 8
const IDLE_HINT_SECONDS := 8.0

const KITTY_SCENE := preload("res://Scenes/unit1-level-6/kitty-poke.tscn")
const ANIM_IDLE := "idle"
const ANIM_POKED := "poked"
# Hidden double-click easter egg — never hinted at, kids find it themselves.
const ANIM_PUSHED := "pushed"

const COL_BG   := Color("e8f0fe")   # calm sky blue
const COL_TEXT := Color("4a5b8c")

# --- Custom display font, same as the other levels ---
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")

# --- Custom cursor, same on every screen ---
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# --- Recorded voice clips ---
const VOICE_INTRO: AudioStream    = preload("res://Assets/unit1-level6/kitty-poke/left-click.mp3")
const VOICE_HAND: AudioStream     = preload("res://Assets/unit1-level6/kitty-poke/arrow-to-hand.mp3")
const VOICE_OTHER_BTN: AudioStream = preload("res://Assets/unit1-level6/kitty-poke/other-button.mp3")
const VOICE_CHAMPION: AudioStream = preload("res://Assets/unit1-level6/kitty-poke/clicking-champion.mp3")

var _clicks := 0
var _kitty: Node2D                  # KittyPoke scene instance
var _kitty_sprite: AnimatedSprite2D
var _kitty_frame_size := Vector2(100, 100)
var _kitty_base_scale := 1.0
var _hovering := false
var _hand_explained := false
var _finished := false
var _last_sound := -1

var _idle_timer: Timer
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _ghost: Node2D
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _current_instruction := "Press the LEFT button — one short click!"


# ----------------------------------------------------------------
#  Setup
# ----------------------------------------------------------------
func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_POINTING_HAND)

	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	# CRITICAL: a Control with the default mouse_filter shows ITS
	# cursor (arrow) and overrides Input.set_default_cursor_shape —
	# the hand cursor never appears unless the bg ignores the mouse.
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_build_kitty()
	_layout_kitty()

	_build_ui()
	_build_ghost_cursor()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_INTRO, "Press the LEFT button — one short click — and see what happens!")
	_idle_timer.start()

	# Gentle breathing so the kitty feels alive while it waits.
	var breathe := create_tween().set_loops()
	breathe.tween_property(_kitty, "scale",
		Vector2.ONE * _kitty_base_scale * 1.03, 1.2).set_trans(Tween.TRANS_SINE)
	breathe.tween_property(_kitty, "scale",
		Vector2.ONE * _kitty_base_scale, 1.2).set_trans(Tween.TRANS_SINE)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Kitty (instance of the KittyPoke scene)
# ----------------------------------------------------------------
func _build_kitty() -> void:
	_kitty = KITTY_SCENE.instantiate() as Node2D
	add_child(_kitty)

	_kitty_sprite = _find_animated_sprite(_kitty)
	assert(_kitty_sprite != null, "kitty-poke.tscn needs an AnimatedSprite2D")
	_kitty_sprite.centered = true
	# Zero any editor-placed offset inside the scene.
	_kitty_sprite.position = Vector2.ZERO

	var tex := _kitty_sprite.sprite_frames.get_frame_texture(ANIM_IDLE, 0)
	if tex:
		_kitty_frame_size = tex.get_size()

	# The poked/pushed reactions play ONCE, then return to idle.
	_kitty_sprite.sprite_frames.set_animation_loop(ANIM_POKED, false)
	_kitty_sprite.sprite_frames.set_animation_loop(ANIM_PUSHED, false)
	_kitty_sprite.animation_finished.connect(_on_kitty_anim_finished)

	_kitty_sprite.play(ANIM_IDLE)


func _find_animated_sprite(node: Node) -> AnimatedSprite2D:
	if node is AnimatedSprite2D:
		return node as AnimatedSprite2D
	for child in node.get_children():
		var found := _find_animated_sprite(child)
		if found:
			return found
	return null


func _layout_kitty() -> void:
	var s := _screen_size()
	_kitty.position = s * 0.5
	# Kitty stands about 25% of the screen tall.
	_kitty_base_scale = (s.y * 0.25) / _kitty_frame_size.y
	_kitty.scale = Vector2.ONE * _kitty_base_scale


func _kitty_radius() -> float:
	# Generous circular hit area around the kitty's centre.
	return maxf(_kitty_frame_size.x, _kitty_frame_size.y) * _kitty_base_scale * 0.55


func _on_kitty_anim_finished() -> void:
	if _kitty_sprite.animation == ANIM_POKED or _kitty_sprite.animation == ANIM_PUSHED:
		_kitty_sprite.play(ANIM_IDLE)


# ----------------------------------------------------------------
#  Hover: pointing-hand cursor + one-time explanation
# ----------------------------------------------------------------
func _process(_delta: float) -> void:
	if _finished:
		return
	var mouse := get_viewport().get_mouse_position()
	var over := mouse.distance_to(_kitty.position) <= _kitty_radius()
	if over and not _hovering:
		Input.set_default_cursor_shape(Input.CURSOR_POINTING_HAND)
		if not _hand_explained:
			_hand_explained = true
			_say(VOICE_HAND, "See? Your arrow turned into a hand! That means you can click!")
	elif not over and _hovering:
		Input.set_default_cursor_shape(Input.CURSOR_ARROW)
	_hovering = over


# ----------------------------------------------------------------
#  Clicks
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_idle_timer.start()
		_hide_ghost()
		return
	if _finished or not (event is InputEventMouseButton):
		return
	var mb := event as InputEventMouseButton
	if not mb.pressed:
		return
	_idle_timer.start()
	_hide_ghost()

	var on_kitty := mb.position.distance_to(_kitty.position) <= _kitty_radius()

	if mb.button_index == MOUSE_BUTTON_RIGHT and on_kitty:
		_say(VOICE_OTHER_BTN, "Oops, other button! The left one, under your pointer finger.")
		return

	if mb.button_index == MOUSE_BUTTON_LEFT and on_kitty:
		if mb.double_click:
			# Secret bonus reaction — not hinted at anywhere, and it
			# doesn't count toward the click goal below.
			_push_kitty()
			return
		_clicks += 1
		_poke_kitty()
		if _clicks >= CLICKS_TO_WIN:
			_finish_level()
	# Clicks that miss the kitty do nothing at all — no fail states.


func _poke_kitty() -> void:
	# Restart the poked animation from the first frame — clicking
	# again mid-reaction simply pokes again, never blocks.
	_kitty_sprite.stop()
	_kitty_sprite.play(ANIM_POKED)
	_play_random_silly_sound()


func _push_kitty() -> void:
	_kitty_sprite.stop()
	_kitty_sprite.play(ANIM_PUSHED)
	_play_sparkle_sound()


# ----------------------------------------------------------------
#  Silly sounds: giggle, boing, whee, achoo (art does the visuals)
# ----------------------------------------------------------------
func _play_random_silly_sound() -> void:
	var pick := randi() % 4
	while pick == _last_sound:
		pick = randi() % 4
	_last_sound = pick
	match pick:
		0:   # giggle: two rising chirps
			_play_tone(700.0, 1000.0, 0.12, 0.2)
			_play_tone_delayed(900.0, 1200.0, 0.12, 0.2, 0.14)
		1:   # boing
			_play_tone(400.0, 900.0, 0.12, 0.25)
		2:   # whee
			_play_tone(500.0, 1400.0, 0.35, 0.2)
		3:   # achoo
			_play_tone(1200.0, 200.0, 0.25, 0.3)


# A little rising sparkle arpeggio for the hidden double-click surprise —
# distinct from the four regular pokes, so it feels like a rare secret.
func _play_sparkle_sound() -> void:
	var notes: Array[float] = [880.0, 1108.0, 1318.0, 1760.0]
	for n in notes.size():
		_play_tone_delayed(notes[n], notes[n] * 1.1, 0.12, 0.22, n * 0.07)


# ----------------------------------------------------------------
#  Finish + star (handled by the global StarChart autoload)
# ----------------------------------------------------------------
func _finish_level() -> void:
	_finished = true
	_idle_timer.stop()
	_hide_ghost()
	Input.set_default_cursor_shape(Input.CURSOR_ARROW)
	_say(VOICE_CHAMPION, "Okay, okay, you're a clicking champion!")
	# Let the whole clip play before the star celebration starts.
	await _voice.finished
	await get_tree().create_timer(0.3).timeout
	StarChart.show_chart(StarChart.UNIT_1_LEVELS)
	await StarChart.add_star(LEVEL_NUMBER)
	level_completed.emit(LEVEL_NUMBER)
	get_tree().change_scene_to_file("res://Scenes/unit1-level7.tscn")


# ----------------------------------------------------------------
#  Idle hint: ghost cursor glides to the kitty and "clicks"
# ----------------------------------------------------------------
func _build_ghost_cursor() -> void:
	_ghost = Node2D.new()
	var arrow := Polygon2D.new()
	arrow.polygon = PackedVector2Array([
		Vector2(0, 0), Vector2(0, 26), Vector2(7, 20),
		Vector2(12, 30), Vector2(16, 28), Vector2(11, 18), Vector2(19, 17)
	])
	arrow.color = Color(0.4, 0.4, 0.9, 0.5)
	_ghost.add_child(arrow)
	_ghost.visible = false
	_ghost.z_index = 100
	add_child(_ghost)


func _on_idle_hint() -> void:
	if _finished:
		return
	_say(VOICE_INTRO, _current_instruction)
	_ghost.visible = true
	_ghost.position = get_viewport().get_mouse_position()
	var t := create_tween()
	t.tween_property(_ghost, "position", _kitty.position, 1.2)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	# A little press-pulse to mime "click".
	t.tween_property(_ghost, "scale", Vector2.ONE * 0.75, 0.12)
	t.tween_property(_ghost, "scale", Vector2.ONE, 0.12)
	t.tween_property(_ghost, "scale", Vector2.ONE * 0.75, 0.12)
	t.tween_property(_ghost, "scale", Vector2.ONE, 0.12)
	t.tween_interval(0.3)
	t.tween_callback(_hide_ghost)
	_idle_timer.start()


func _hide_ghost() -> void:
	if _ghost:
		_ghost.visible = false
		_ghost.scale = Vector2.ONE


# ----------------------------------------------------------------
#  UI: one short text line + speaker button
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
	_instruction_label.add_theme_color_override("font_outline_color", Color("5a4a6b"))
	_instruction_label.add_theme_constant_override("outline_size", 10)
	_instruction_label.add_theme_constant_override("line_separation", 28)
	# Just below the star badge row, with breathing room.
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
	_speaker_btn.pressed.connect(func () -> void: _say(VOICE_INTRO, _current_instruction))
	layer.add_child(_speaker_btn)


# ----------------------------------------------------------------
#  Narration: recorded voice clips (audio-first), text line synced
# ----------------------------------------------------------------
func _say(clip: AudioStream, text: String) -> void:
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
func _play_tone(freq_start: float, freq_end: float, dur: float, vol: float) -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _tone_wave(freq_start, freq_end, dur, vol)
	player.finished.connect(player.queue_free)
	player.play()


# Builds the tone as a real WAV buffer up front instead of feeding an
# AudioStreamGenerator live from the main thread — the live-push API
# contends with the audio mixer thread, and several tones/voice lines
# starting at once (e.g. right after finishing a level) was able to
# hang the whole process.
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


func _play_tone_delayed(freq_start: float, freq_end: float, dur: float, vol: float, delay: float) -> void:
	get_tree().create_timer(delay).timeout.connect(
		func () -> void: _play_tone(freq_start, freq_end, dur, vol)
	)
