<script setup>
    import {nextTick, ref, watch} from 'vue'
    import BlockEditor from '@/views/BlockEditor.vue';
    import { useBlocksStore } from '@/stores/blocks'
    import { storeToRefs } from 'pinia';

    const blocksStore = useBlocksStore()

    const props = defineProps({
        block : Object,
        pageId: String
    })

    const emit = defineEmits(['create-after'])

    const errorMsg = ref("")

    const localTextContent = ref(props.block.content.text)

    const typeClass = ref(props.block.type)

    const {focusRequestId } = storeToRefs(blocksStore)

    const inputEl = ref(null)

    function onFocus() {
        blocksStore.setCurrentBlock(props.block.id)
    }

    async function onBlur() {
        await nextTick()

        const el = document.activeElement
        const isAnotherBlockEditor =
            el && el instanceof HTMLElement && el?.dataset?.blockEditor === 'true'
        
        if(!isAnotherBlockEditor){
            blocksStore.clearCurrentBlock()
        }

    }

    async function handleSplitAndCreate(e){
        const el = e.target
        const text = e.target.value ?? ''
        const caret = 
            typeof el.selectionStart === 'number'
            ? el.selectionStart : text.length
        

        const left = text.slice(0, caret)
        const right = text.slice(caret)

        await blocksStore.updateBlockContent(props.block.id,{text: left})

        const newId = await blocksStore.addNewBlock(props.pageId,
        {content: {text: right},
        type: props.block.type},
        props.block.id)
        console.log(newId)
        blocksStore.requestFocus(newId, 0)

    }

    async function onKeydown(e) {
        const isCode = props.block.type === 'code'

        if (!isCode && e.key === 'Enter') {
            e.preventDefault()
            await handleSplitAndCreate(e)
            //emit('create-after', props.block.id)
            return
        }
        if(isCode && e.key === 'Enter' && e.shiftKey) {
            e.preventDefault()
            //emit('create-after', props.block.id)
            await handleSplitAndCreate(e)
            return
        }
        if (e.key === 'Tab' && !isCode) {
            e.preventDefault()
            const caret = e.target.selectionStart ?? 0

            try {
                if (e.shiftKey) await blocksStore.outdentBlock(props.pageId, props.block.id)
                else await blocksStore.indentBlock(props.pageId, props.block.id)

                blocksStore.requestFocus(props.block.id, caret)
            } catch {
                errorMsg.value = "Error modifying blocks hierarchy"
            }
            return
            }


    }




    //Debounce and update blocks
    let t = null
    async function handleInput(inputEvent) {
        const newInput = inputEvent.target.value
        localTextContent.value = newInput
        const newContent = {"text": newInput, }
        //console.log(inputEvent.target.value)

        if(t) clearTimeout(t)
        t = setTimeout(async () => {
            try{
            await blocksStore.updateBlockContent(props.block.id, newContent)
            //console.log("NEW LOCAL TEXT:",localTextContent.value)
        }catch{
            errorMsg.value="Error saving local version"
        }
        }, 300)
        
    }

    watch(
        () => props.block.content.text, (newText) => {
            localTextContent.value = newText
         }
    )
    watch(
        () => props.block.type, (newType) => {
            typeClass.value = newType
         }
    )
    
   
    watch(
        focusRequestId,
        async (req) => {
            if (!req || String(req.blockId) !== String(props.block.id)) return
            await nextTick()
            inputEl.value?.focus()
            if (typeof req.caret === 'number') {
            inputEl.value?.setSelectionRange?.(req.caret, req.caret)
            }
            blocksStore.clearFocusRequest()
        },
        { flush: 'post' }
        )

    

</script>

<template>
    <!--<div>
        <Component
            :is = "isMultiline ? 'textarea' : 'input'"
            :value = "localTextContent"
            class = "input"
            :class = "typeClass"
            @input = "handleInput"
        />
    </div>-->
<!-- monolinea: input, multilinea: textarea per code -->
    <input
        v-if="block.type !== 'code'"
        ref="inputEl"
        class="input"
        :class = "typeClass"
        :value="localTextContent"
        data-block-editor="true"
        :data-block-id="block.id"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
        @input = "handleInput"
    />

    <textarea
        v-else
        ref="inputEl"
        class="input code"
        :class = "typeClass"
        :value="localTextContent"
        data-block-editor="true"
        :data-block-id="block.id"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
        @input = "handleInput"
    />

</template>

<style scoped>
.input{
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  resize: none;
  font: inherit;
  padding: 0 0;
  line-height: 2em;
}
.h1 { font-size: 28px; font-weight: 700; }
.h2 { font-size: 22px; font-weight: 650; }
.h3 { font-size: 18px; font-weight: 600; }
.quote { padding-left: 10px; border-left: 3px solid rgba(0,0,0,0.25); }
.code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
</style>